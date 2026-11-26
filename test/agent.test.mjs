import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicKey, randomBytes, verify } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { d10AgentClaimMessage } from '@flop-labs/sdk'
import { claimDecision, requestClaim, verifyTransfer } from '../src/faucet.mjs'
import { identityFromSeed, initialize, loadIdentity, publicIdentity } from '../src/identity.mjs'
import { mode, monitor } from '../src/monitor.mjs'
import { faucetRules, network, publicReadFailure, retryMonitorRead, validateChain, validateRuntime, verifyNetwork } from '../src/network.mjs'
import { activity, nextHeartbeat } from '../api/status.mjs'

const finalized = '0x' + 'ab'.repeat(32)
const chain = { network: 'testnet', genesisHash: network.genesis, decimals: 18, ss58Format: 42,
  tokenSymbol: 'FLOP', rpc: network.ws }
const runtime = { specName: 'flop-testnet', specVersion: 1014039, transactionVersion: 2 }
const now = 1795690000000
const grant = { claimPath: '/v1/testnet/agent-claims', grantFlop: 10, rolling24HourCapFlop: 10,
  cooldownSeconds: 86400, rolloverRequiresSpend: true }

const fakeRequest = async (url, body) => {
  if (url.endsWith('/chain')) return chain
  if (url.endsWith('/limits')) return { network: 'testnet', stale: false, asOf: new Date(now).toISOString(),
    faucet: { status: 'open', agent: grant, signer: publicIdentity(Buffer.alloc(32)).address } }
  if (url.endsWith('/v1/models')) return { data: [{ id: 'test-model' }] }
  assert.equal(url, network.rpc)
  const result = {
    chain_getBlockHash: network.genesis, chain_getFinalizedHead: finalized,
    state_getRuntimeVersion: runtime, chain_getHeader: { number: '0x123' }
  }[body.method]
  return { id: 1, result }
}

test('deterministic public DID and SS58 vectors', () => {
  // Public key only: independently checked with the Polkadot address codec.
  const result = publicIdentity(Buffer.alloc(32))
  assert.equal(result.address, '5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM')
  assert.equal(result.did, 'did:key:z6MkeTG3bFFSLYVU7VqhgZxqr6YzpaGrQtFMh1uvqGy1vDnP')
})

test('claim signature verifies for the exact UTF-8 message', () => {
  const identity = identityFromSeed(randomBytes(32))
  const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519',
    x: Buffer.from(identity.publicKey, 'hex').toString('base64url') }, format: 'jwk' })
  const signature = Buffer.from(identity.signClaim('10').slice(2), 'hex')
  assert.equal(signature.length, 64)
  assert.equal(verify(null, Buffer.from(d10AgentClaimMessage(identity.address, '10')), publicKey, signature), true)
  assert.equal(verify(null, Buffer.from(d10AgentClaimMessage(identity.address, '11')), publicKey, signature), false)
  assert.throws(() => identity.signClaim('001'), /INVALID_NONCE/)
})

test('initialization is exclusive and recovery preserves identity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flop-'))
  try {
    const file = join(dir, 'identity.seed')
    const original = initialize(file)
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.equal(loadIdentity(file).did, original.did)
    assert.throws(() => initialize(file), { code: 'EEXIST' })
    assert.equal(loadIdentity(file).address, original.address)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('genesis, chain identity and incompatible runtime are rejected', async () => {
  assert.throws(() => validateChain(finalized, chain), /MISMATCH/)
  assert.throws(() => validateChain(network.genesis, { ...chain, network: 'devnet' }), /MISMATCH/)
  assert.throws(() => validateChain(network.genesis, { ...chain, rpc: 'ws://localhost' }), /MISMATCH/)
  assert.throws(() => validateRuntime({ ...runtime, specVersion: 1 }), /RUNTIME_INCOMPATIBLE/)
  assert.throws(() => validateRuntime({ ...runtime, transactionVersion: 3 }), /RUNTIME_INCOMPATIBLE/)
  assert.equal((await verifyNetwork(fakeRequest)).height, 291)
})

test('production network verification uses the pinned Testnet WebSocket SDK connection', async () => {
  let disconnected = false
  const header = { number: { toString: () => '291' } }
  const api = {
    genesisHash: { toHex: () => network.genesis },
    rpc: { chain: {
      getFinalizedHead: async () => ({ toHex: () => finalized }),
      getHeader: async () => header
    } },
    runtimeVersion: { toJSON: () => runtime },
    at: async () => ({ runtimeVersion: { toJSON: () => runtime } }),
    disconnect: async () => { disconnected = true }
  }
  const result = await verifyNetwork(async url => {
    assert.equal(url, network.faucet + '/chain')
    return chain
  }, async (endpoint, rpc, options) => {
    assert.equal(endpoint, network.ws)
    assert.equal(rpc, undefined)
    assert.equal(options.expectedGenesisHash, network.genesis)
    return api
  })
  assert.equal(result.height, 291)
  assert.equal(result.finalized, finalized)
  assert.equal(disconnected, true)
})

test('a WebSocket transport failure falls back to the same verified read-only HTTP checks', async () => {
  const result = await verifyNetwork(fakeRequest, async () => {
    throw new Error('RPC unreachable: connection to wss://testnet.flop.network timed out')
  })
  assert.equal(result.runtime, runtime.specVersion)
  assert.equal(result.height, 0x123)
  let requests = 0
  await assert.rejects(verifyNetwork(async () => { requests++; }, async () => {
    throw new Error('GENESIS_OR_PROFILE_MISMATCH')
  }), /GENESIS_OR_PROFILE_MISMATCH/)
  assert.equal(requests, 0)
})

test('stale or modified faucet rules are rejected', async () => {
  const payload = await fakeRequest(network.faucet + '/limits')
  assert.equal(faucetRules(payload, now).grantFlop, 10)
  assert.throws(() => faucetRules(payload, now + 360000), /RULES_CHANGED/)
  payload.faucet.agent = { ...grant, grantFlop: 11 }
  assert.throws(() => faucetRules(payload, now), /RULES_CHANGED/)
})

test('halt does not call network and scored mode cannot be enabled', async () => {
  assert.equal(mode(), 'MONITOR_ONLY')
  assert.throws(() => mode('devnet'), /INVALID_MODE/)
  const request = () => assert.fail('unexpected network request')
  assert.equal((await monitor({ executionMode: 'HALTED', request })).mode, 'HALTED')
  await assert.rejects(monitor({ executionMode: 'SCORED_ACTIVE', request }), /SCORING_UNVERIFIED/)
})

test('unscored catalog activity is excluded and provider errors are redacted', async () => {
  const state = await monitor({ request: async (url, body) => {
    if (url.endsWith('/limits')) throw new Error('private error payload')
    return fakeRequest(url, body)
  } })
  assert.equal(state.eligibleActivity, 0)
  assert.equal(state.spending, 'disabled')
  assert.equal(state.models[0].id, 'test-model')
  assert.doesNotMatch(JSON.stringify(state), /private error payload/)
})

test('claim cooldown and finalized spend gate', () => {
  assert.throws(() => claimDecision({ status: 'finalized', checkedAt: now }, now), /COOLDOWN/)
  assert.throws(() => claimDecision({ status: 'finalized', checkedAt: now }, now + 86400000), /SPEND_UNVERIFIED/)
})

test('claim timeout persists nonce, prevents concurrent execution and reconciles without duplicates', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'flop-'))
  const path = join(directory, 'claims.sqlite')
  let resolveEntered, release
  const entered = new Promise(resolve => { resolveEntered = resolve })
  const pending = new Promise(resolve => { release = resolve })
  let time = now
  let firstNonce
  const opts = { path, identity: identityFromSeed(randomBytes(32)), executionMode: 'INTEGRATION_TEST',
    approved: true, request: fakeRequest, clock: () => time }
  try {
    await assert.rejects(requestClaim({ ...opts, approved: false }), /OWNER_OPT_IN_REQUIRED/)
    const first = requestClaim({ ...opts, transport: async (_, nonce) => {
      firstNonce = nonce
      resolveEntered()
      await pending
      throw new Error('timeout')
    } })
    await entered
    await assert.rejects(requestClaim(opts), { code: 'EEXIST' })
    release()
    assert.equal((await first).status, 'pending')
    assert.equal((await requestClaim({ ...opts, transport: () => assert.fail() })).nonce, firstNonce)
    await assert.rejects(requestClaim({ ...opts, identity: identityFromSeed(randomBytes(32)) }), /IDENTITY_MISMATCH/)
    time += 300000
    const recovered = await requestClaim({ ...opts, transport: async (_, nonce) => {
      assert.equal(nonce, firstNonce)
      return { hash: finalized, retryAt: time + 300000 }
    } })
    assert.equal(recovered.hash, finalized)
    assert.equal((await requestClaim({ ...opts, transport: () => assert.fail() })).hash, finalized)
  } finally {
    release()
    rmSync(directory, { recursive: true })
  }
})

test('finalized transfer requires the expected successful extrinsic, signer, recipient and amount', () => {
  const block = { block: { extrinsics: [{ hash: { toHex: () => finalized } }] } }
  const phase = { isApplyExtrinsic: true, asApplyExtrinsic: { toNumber: () => 0 } }
  const success = { phase, event: { section: 'system', method: 'ExtrinsicSuccess' } }
  const transfer = { phase, event: { section: 'balances', method: 'Transfer',
    data: ['signer', 'agent', '10000000000000000000'] } }
  const options = { block, hash: finalized, address: 'agent', signer: 'signer' }
  assert.doesNotThrow(() => verifyTransfer({ ...options, events: [success, transfer] }))
  assert.throws(() => verifyTransfer({ ...options, events: [transfer] }), /TRANSFER_UNVERIFIED/)
  assert.throws(() => verifyTransfer({ ...options, address: 'other', events: [success, transfer] }), /TRANSFER_UNVERIFIED/)
})

test('estimation rejects unavailable miners and quotes over the spending cap', async () => {
  const { estimateInference } = await import('../src/inference.mjs')
  let miners = 1
  const options = {
    executionMode: 'INTEGRATION_TEST', model: 'test-model', prompt: 'Explain finality.', maxTokens: 64,
    maxFlop: '0.01', request: async (url, body) => {
      if (url.endsWith('/models/estimate')) {
        return { model: body.model, available_miners: miners, estimated_cost_flop: '0.005',
          recommended_payment: '0.007' }
      }
      return fakeRequest(url, body)
    }
  }
  assert.equal((await estimateInference(options)).spendingAuthorized, false)
  await assert.rejects(estimateInference({ ...options, maxFlop: '0.006' }), /CAP_EXCEEDED/)
  miners = 0
  await assert.rejects(estimateInference(options), /MINERS_UNAVAILABLE/)
})

test('a pending forced settlement and over-budget payout are rejected', async () => {
  const { settledPayment } = await import('../src/finality.mjs')
  const success = { section: 'system', method: 'ExtrinsicSuccess' }
  const payout = { section: 'computeChannel', method: 'Settled',
    data: [{ toHex: () => finalized }, '80', '20', '1000'] }
  const posted = { ...payout, method: 'SettlementPosted' }
  assert.throws(() => settledPayment([success, posted], finalized, 100n), /SETTLEMENT_MISSING/)
  assert.throws(() => settledPayment([success, payout], finalized, 99n), /AMOUNT_UNVERIFIED/)
  assert.throws(() => settledPayment([payout], finalized, 100n), /EXTRINSIC_UNVERIFIED/)
  assert.equal(settledPayment([success, payout], finalized, 100n).onChainPaymentPlanck, '100')
})

test('hosted resume cannot create a fresh intent and checkpoint failures prevent submission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flop-'))
  try {
    const opts = { path: join(dir, 'claims.sqlite'), identity: identityFromSeed(randomBytes(32)),
      executionMode: 'INTEGRATION_TEST', approved: true, request: fakeRequest, clock: () => now,
      transport: () => assert.fail('unsafe send') }
    assert.equal((await requestClaim({ ...opts, resumeOnly: true })).status, 'awaiting-manual-start')
    await assert.rejects(requestClaim({ ...opts, checkpoint: async () => { throw new Error('sync unavailable') } }),
      /sync unavailable/)
    assert.equal((await requestClaim({ ...opts, resumeOnly: true })).status, 'pending')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('stopping after checkpoint prevents a hosted faucet submission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flop-'))
  let checkpointed = false
  try {
    await assert.rejects(requestClaim({
      path: join(dir, 'claims.sqlite'), identity: identityFromSeed(randomBytes(32)),
      executionMode: 'INTEGRATION_TEST', approved: true, request: fakeRequest, clock: () => now,
      checkpoint: async () => { checkpointed = true },
      beforeSubmit: async () => { assert.ok(checkpointed); throw new Error('HALTED') },
      transport: () => assert.fail('unsafe send')
    }), /HALTED/)
  } finally { rmSync(dir, { recursive: true }) }
})

test('dashboard schedule reports the next UTC minute 07 without rounding down', () => {
  assert.equal(nextHeartbeat(new Date('2026-11-26T13:06:30Z')), '2026-11-26T13:07:00.000Z')
  assert.equal(nextHeartbeat(new Date('2026-11-26T13:07:00Z')), '2026-11-26T14:07:00.000Z')
})

test('dashboard activity chart counts only monitor runs within the last 24 hours', () => {
  const now = Date.parse('2026-11-26T13:10:00Z')
  const series = activity([
    { workflow: 'monitor.yml', createdAt: new Date(now - 1000).toISOString(), conclusion: 'success' },
    { workflow: 'monitor.yml', createdAt: new Date(now - 1000).toISOString(), conclusion: 'failure' },
    { workflow: 'claim.yml', createdAt: new Date(now - 1000).toISOString(), conclusion: 'success' },
    { workflow: 'monitor.yml', createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(), conclusion: 'success' }
  ], now)
  assert.equal(series.length, 12)
  assert.equal(series.at(-1).total, 2)
  assert.equal(series.at(-1).successful, 1)
})

test('dashboard JavaScript references only elements in the production page', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  const script = readFileSync(new URL('../public/dashboard.js', import.meta.url), 'utf8')
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
  const referenced = [...script.matchAll(/(?:display|pill)\('([^']+)'/g)].map(match => match[1])
  assert.deepEqual([...new Set(referenced.filter(id => !ids.has(id)))], [])
  assert.match(script, /Catalog only; no payable route verified for this agent/)
  assert.match(script, /advertised addresses/)
})

test('public dashboard status uses the pinned SDK and allowlisted retry path', () => {
  const status = readFileSync(new URL('../api/status.mjs', import.meta.url), 'utf8')
  assert.match(status, /connectFlopApi/)
  assert.match(status, /request:\s*retryMonitorRead,\s*connect:\s*connectFlopApi/)
})

test('monitor retries only allowlisted idempotent reads and only transient errors', async () => {
  let calls = 0
  const wait = async () => {}
  const result = await retryMonitorRead(network.rpc, { jsonrpc: '2.0', id: 1,
    method: 'chain_getFinalizedHead', params: [] }, async () => {
    if (++calls < 3) throw Object.assign(new Error('temporary'), { name: 'TypeError' })
    return { result: finalized }
  }, wait, () => 0)
  assert.equal(result.result, finalized)
  assert.equal(calls, 3)
  calls = 0
  await assert.rejects(retryMonitorRead(network.rpc, { jsonrpc: '2.0', id: 1,
    method: 'author_submitExtrinsic', params: ['0x'] }, async () => { calls++ }, wait), /UNAPPROVED_MONITOR_READ/)
  await assert.rejects(retryMonitorRead(network.rpc, { jsonrpc: '2.0', id: 1,
    method: 'chain_getBlockHash', params: [0] }, async () => { calls++; throw new Error('RUNTIME_INCOMPATIBLE') }, wait), /RUNTIME_INCOMPATIBLE/)
  assert.equal(calls, 1)
  await assert.rejects(retryMonitorRead(network.faucet + '/v1/testnet/agent-claims', {},
    async () => { calls++ }, wait), /UNAPPROVED_MONITOR_READ/)
  await assert.rejects(retryMonitorRead(network.faucet + '/chain', undefined,
    async () => { calls++; throw new Error('RUNTIME_INCOMPATIBLE') }, wait), /RUNTIME_INCOMPATIBLE/)
  assert.equal(calls, 2)
  assert.equal(publicReadFailure(new Error('RUNTIME_INCOMPATIBLE')), 'RUNTIME_INCOMPATIBLE')
  assert.equal(publicReadFailure(new Error('sensitive endpoint detail')), 'READ_FAILED')
})
