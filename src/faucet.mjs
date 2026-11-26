import { mkdirSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { connectFlopApi, D10_AGENT_CLAIM_PATH } from '@flop-labs/sdk'
import { faucetRules, isHash, json, network, rpc, verifyNetwork } from './network.mjs'

const DAY = 86400000
const GRANT_PLANCK = 10n * 10n ** 18n

export function claimDecision(previous, now) {
  if (!previous) return 'new'
  if (previous.status === 'pending') return now >= previous.retryAt ? 'reconcile' : 'backoff'
  if (now < previous.checkedAt + DAY) throw new Error('COOLDOWN')
  // A later claim requires verified spend evidence. This release has no qualified spend adapter.
  throw new Error('PREVIOUS_ALLOCATION_SPEND_UNVERIFIED')
}

async function submitClaim(identity, nonce) {
  const response = await fetch(network.faucet + D10_AGENT_CLAIM_PATH, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: identity.address, nonce, signature: identity.signClaim(nonce) })
  })
  const retry = response.headers.get('retry-after')
  const payload = await response.json().catch(() => null)
  const waitMs = retry === null ? 0 : /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()
  const bodyWaitMs = Number.isSafeInteger(payload?.retryAfterSeconds) ? payload.retryAfterSeconds * 1000 : 0
  return {
    hash: response.ok && isHash(payload?.txHash) ? payload.txHash : null,
    retryAt: Date.now() + Math.max(300000, waitMs || 0, bodyWaitMs)
  }
}

export function withJournal(path, operation) {
  if (!path) throw new Error('JOURNAL_REQUIRED')
  return runWithJournal(path, operation)
}

async function runWithJournal(path, operation) {
  const lock = path + '.lock'
  mkdirSync(lock, { mode: 0o700 })
  let db
  try {
    db = new DatabaseSync(path)
    db.exec(`PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS claims (
        address TEXT PRIMARY KEY, nonce TEXT NOT NULL, status TEXT NOT NULL,
        retryAt INTEGER NOT NULL, checkedAt INTEGER NOT NULL, hash TEXT, signer TEXT NOT NULL,
        startHeight INTEGER NOT NULL, block TEXT, balancePlanck TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS claim_events (
        address TEXT NOT NULL, nonce TEXT NOT NULL, event TEXT NOT NULL,
        time INTEGER NOT NULL, hash TEXT
      ) STRICT;`)
    return await operation(db)
  } finally {
    db?.close()
    rmSync(lock, { recursive: true })
  }
}

export async function requestClaim({ path, identity, executionMode, approved, request = json,
  transport = submitClaim, clock = Date.now }) {
  if (executionMode !== 'INTEGRATION_TEST' || approved !== true) throw new Error('OWNER_OPT_IN_REQUIRED')
  return withJournal(path, async db => {
    const bound = db.prepare('SELECT * FROM claims LIMIT 1').get()
    if (bound && bound.address !== identity.address) throw new Error('IDENTITY_MISMATCH')
    const now = clock()
    const decision = claimDecision(bound, now)
    if (decision === 'backoff' || (bound?.hash && isHash(bound.hash))) return bound
    const verified = await verifyNetwork(request)
    const limits = await request(network.faucet + '/limits')
    faucetRules(limits, now)
    const signer = limits.faucet.signer
    if (typeof signer !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{48}$/.test(signer)) {
      throw new Error('FAUCET_SIGNER_INVALID')
    }
    if (bound && bound.signer !== signer) throw new Error('FAUCET_SIGNER_CHANGED')
    const nonce = bound?.nonce ?? String(now)
    db.exec('BEGIN IMMEDIATE')
    try {
      if (!bound) {
        db.prepare(`INSERT INTO claims
          (address,nonce,status,retryAt,checkedAt,signer,startHeight) VALUES (?,?,'pending',?,?,?,?)`)
          .run(identity.address, nonce, now + 300000, now, signer, verified.height)
      } else {
        db.prepare('UPDATE claims SET retryAt = ? WHERE address = ?').run(now + 300000, identity.address)
      }
      db.prepare('INSERT INTO claim_events VALUES (?,?,?,?,NULL)').run(identity.address, nonce, 'attempt', now)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    // An interrupted request leaves the same nonce durably reserved for reconciliation.
    const outcome = await transport(identity, nonce).catch(() => ({ hash: null, retryAt: now + 300000 }))
    db.prepare('UPDATE claims SET hash = ?, retryAt = ? WHERE address = ?')
      .run(outcome.hash, outcome.retryAt, identity.address)
    return db.prepare('SELECT * FROM claims WHERE address = ?').get(identity.address)
  })
}

export function verifyTransfer({ block, events, hash, address, signer }) {
  const index = block.block.extrinsics.findIndex(extrinsic => extrinsic.hash.toHex() === hash)
  if (index < 0) throw new Error('TRANSACTION_NOT_IN_BLOCK')
  const matches = events.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === index)
  const succeeded = matches.some(({ event }) => event.section === 'system' && event.method === 'ExtrinsicSuccess')
  const transfer = matches.some(({ event }) => event.section === 'balances' && event.method === 'Transfer' &&
    event.data[0].toString() === signer && event.data[1].toString() === address &&
    BigInt(event.data[2].toString()) === GRANT_PLANCK)
  if (!succeeded || !transfer) throw new Error('FINALIZED_GRANT_TRANSFER_UNVERIFIED')
}

export async function reconcileClaim(path, blockHash, executionMode) {
  if (executionMode === 'HALTED') throw new Error('HALTED')
  if (!isHash(blockHash)) throw new Error('BLOCK_HASH_REQUIRED')
  return withJournal(path, async db => {
    const row = db.prepare("SELECT * FROM claims WHERE status = 'pending'").get()
    if (!isHash(row?.hash)) throw new Error('CLAIM_HASH_UNAVAILABLE')
    const head = await verifyNetwork()
    const header = await rpc('chain_getHeader', [blockHash])
    if (!/^0x[0-9a-f]+$/.test(header?.number)) throw new Error('INVALID_BLOCK')
    const height = Number(BigInt(header.number))
    if (height <= row.startHeight || height > head.height ||
        await rpc('chain_getBlockHash', [height]) !== blockHash) throw new Error('BLOCK_NOT_FINALIZED')
    const api = await connectFlopApi(network.ws, undefined, { expectedGenesisHash: network.genesis, timeoutMs: 12000 })
    try {
      const at = await api.at(blockHash)
      const [block, events, account] = await Promise.all([
        api.rpc.chain.getBlock(blockHash), at.query.system.events(), at.query.system.account(row.address)
      ])
      verifyTransfer({ block, events, hash: row.hash, address: row.address, signer: row.signer })
      const balance = account.data.free.toString()
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare("UPDATE claims SET status = 'finalized', block = ?, checkedAt = ?, balancePlanck = ? WHERE address = ?")
          .run(blockHash, Date.now(), balance, row.address)
        db.prepare('INSERT INTO claim_events VALUES (?,?,?,?,?)')
          .run(row.address, row.nonce, 'finalized', Date.now(), row.hash)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return db.prepare('SELECT * FROM claims WHERE address = ?').get(row.address)
    } finally {
      await api.disconnect()
    }
  })
}
