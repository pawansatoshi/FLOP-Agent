import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { connectFlopApi, D10_AGENT_CLAIM_PATH } from '@flop-labs/sdk'
import { finalizedBlock, eventsForTransaction } from './finality.mjs'
import { faucetRules, isHash, json, network, verifyNetwork } from './network.mjs'

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
      CREATE TABLE IF NOT EXISTS claim_scans (
        address TEXT PRIMARY KEY, throughHeight INTEGER NOT NULL
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
  transport = submitClaim, clock = Date.now, checkpoint = async () => {}, resumeOnly = false }) {
  if (executionMode !== 'INTEGRATION_TEST' || approved !== true) throw new Error('OWNER_OPT_IN_REQUIRED')
  return withJournal(path, async db => {
    const bound = db.prepare('SELECT * FROM claims LIMIT 1').get()
    if (bound && bound.address !== identity.address) throw new Error('IDENTITY_MISMATCH')
    if (!bound && resumeOnly) return { status: 'awaiting-manual-start' }
    if (resumeOnly && bound?.status === 'finalized') return bound
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

    await checkpoint(path)

    // An interrupted request leaves the same nonce durably reserved for reconciliation.
    const outcome = await transport(identity, nonce).catch(() => ({ hash: null, retryAt: now + 300000 }))
    db.prepare('UPDATE claims SET hash = ?, retryAt = ? WHERE address = ?')
      .run(outcome.hash, outcome.retryAt, identity.address)
    await checkpoint(path)
    return db.prepare('SELECT * FROM claims WHERE address = ?').get(identity.address)
  })
}

export function verifyTransfer({ block, events, hash, address, signer }) {
  const matches = eventsForTransaction(block, events, hash)
  const succeeded = matches.some(event => event.section === 'system' && event.method === 'ExtrinsicSuccess')
  const transfer = matches.some(event => event.section === 'balances' && event.method === 'Transfer' &&
    event.data[0].toString() === signer && event.data[1].toString() === address &&
    BigInt(event.data[2].toString()) === GRANT_PLANCK)
  if (!succeeded || !transfer) throw new Error('FINALIZED_GRANT_TRANSFER_UNVERIFIED')
}

export async function reconcileClaim(path, blockHash, executionMode, checkpoint = async () => {}) {
  if (executionMode === 'HALTED') throw new Error('HALTED')
  if (blockHash !== undefined && !isHash(blockHash)) throw new Error('BLOCK_HASH_REQUIRED')
  return withJournal(path, async db => {
    const row = db.prepare("SELECT * FROM claims WHERE status = 'pending'").get()
    if (!isHash(row?.hash)) throw new Error('CLAIM_HASH_UNAVAILABLE')
    const head = await verifyNetwork()
    const api = await connectFlopApi(network.ws, undefined, { expectedGenesisHash: network.genesis, timeoutMs: 12000 })
    try {
      let block
      if (blockHash) {
        const height = await finalizedBlock(blockHash, head)
        if (height <= row.startHeight) throw new Error('BLOCK_PRECEDES_CLAIM')
      } else {
        const cursor = db.prepare('SELECT throughHeight FROM claim_scans WHERE address = ?').get(row.address)
        const start = Math.max(row.startHeight, cursor?.throughHeight ?? 0) + 1
        const end = Math.min(head.height, start + 31)
        for (let height = start; height <= end; height++) {
          const hash = await api.rpc.chain.getBlockHash(height)
          const candidate = await api.rpc.chain.getBlock(hash)
          if (candidate.block.extrinsics.some(extrinsic => extrinsic.hash.toHex() === row.hash)) {
            blockHash = hash.toHex()
            block = candidate
            break
          }
        }
        if (!blockHash) {
          if (end >= start) {
            db.prepare('INSERT OR REPLACE INTO claim_scans VALUES (?, ?)').run(row.address, end)
            await checkpoint(path)
          }
          return row
        }
      }
      const at = await api.at(blockHash)
      const [confirmedBlock, events, account] = await Promise.all([
        block ?? api.rpc.chain.getBlock(blockHash), at.query.system.events(), at.query.system.account(row.address)
      ])
      verifyTransfer({ block: confirmedBlock, events, hash: row.hash, address: row.address, signer: row.signer })
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
      await checkpoint(path)
      return db.prepare('SELECT * FROM claims WHERE address = ?').get(row.address)
    } finally {
      await api.disconnect()
    }
  })
}

export function readClaim(path, address) {
  if (!path || !address || !existsSync(path)) return undefined
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const row = db.prepare('SELECT status, hash, block, checkedAt, retryAt FROM claims WHERE address = ?').get(address)
    if (!row) return undefined
    return {
      status: row.status, transactionHash: isHash(row.hash) ? row.hash : null,
      blockHash: isHash(row.block) ? row.block : null,
      finalizedAt: row.status === 'finalized' ? new Date(row.checkedAt).toISOString() : null,
      cooldownEndsAt: row.status === 'finalized' ? new Date(row.checkedAt + DAY).toISOString() : null,
      retryAfter: row.status === 'pending' ? new Date(row.retryAt).toISOString() : null,
      rollover: 'Requires verified inference spend'
    }
  } finally {
    db.close()
  }
}
