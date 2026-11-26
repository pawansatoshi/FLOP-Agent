import { SUPPORTED_SPEC_VERSIONS } from '@flop-labs/sdk'
import network from '../network.json' with { type: 'json' }

export { network }
export const isHash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value)

export async function json(url, body) {
  const response = await fetch(url, {
    redirect: 'error', signal: AbortSignal.timeout(12000),
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    })
  })
  if (!response.ok) throw new Error('HTTP_' + response.status)
  return response.json()
}

const monitorRpcMethods = new Set([
  'chain_getBlockHash', 'chain_getFinalizedHead', 'state_getRuntimeVersion', 'chain_getHeader'
])

function transientReadError(error) {
  if (/^HTTP_(429|5\d\d)$/.test(error?.message ?? '')) return true
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.name === 'TypeError') return true
  return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(error?.cause?.code)
}

export async function retryMonitorRead(url, body, request = json, wait = ms =>
  new Promise(resolve => setTimeout(resolve, ms)), random = Math.random) {
  const readGet = body === undefined && [network.faucet + '/chain', network.faucet + '/limits',
    network.gateway + '/v1/models'].includes(url)
  const readRpc = url === network.rpc && body?.jsonrpc === '2.0' && body.id === 1 &&
    monitorRpcMethods.has(body.method) && Array.isArray(body.params)
  if (!readGet && !readRpc) throw new Error('UNAPPROVED_MONITOR_READ')
  for (let attempt = 0; ; attempt++) {
    try { return await request(url, body) } catch (error) {
      if (attempt >= 2 || !transientReadError(error)) throw error
      await wait(Math.min(250 * (2 ** attempt) + Math.floor(random() * 250), 2000))
    }
  }
}

export function publicReadFailure(error) {
  const message = error?.message ?? ''
  if (/^HTTP_\d{3}$/.test(message)) return message
  if (/^[A-Z][A-Z0-9_]{2,63}$/.test(message)) return message
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'REQUEST_TIMEOUT'
  if (error?.name === 'TypeError') return 'NETWORK_UNREACHABLE'
  return 'READ_FAILED'
}

export async function rpc(method, params = [], request = json) {
  const response = await request(network.rpc, { jsonrpc: '2.0', id: 1, method, params })
  if (response?.id !== 1 || response.error || !Object.hasOwn(response, 'result')) {
    throw new Error('RPC_ERROR')
  }
  return response.result
}

export function validateChain(genesis, chain) {
  if (genesis !== network.genesis || chain?.network !== network.network ||
      chain.genesisHash !== network.genesis || chain.rpc !== network.ws ||
      chain.ss58Format !== network.ss58 || chain.decimals !== network.decimals ||
      chain.tokenSymbol !== 'FLOP') throw new Error('GENESIS_OR_PROFILE_MISMATCH')
}

export function validateRuntime(runtime) {
  if (runtime?.specName !== 'flop-testnet' || runtime.transactionVersion !== 2 ||
      !SUPPORTED_SPEC_VERSIONS.includes(runtime.specVersion)) throw new Error('RUNTIME_INCOMPATIBLE')
}

export async function verifyNetwork(request = json) {
  const [genesis, chain, finalized] = await Promise.all([
    rpc('chain_getBlockHash', [0], request),
    request(network.faucet + '/chain'),
    rpc('chain_getFinalizedHead', [], request)
  ])
  validateChain(genesis, chain)
  if (!isHash(finalized)) throw new Error('INVALID_FINALIZED_HEAD')
  const [runtime, currentRuntime, header] = await Promise.all([
    rpc('state_getRuntimeVersion', [finalized], request),
    rpc('state_getRuntimeVersion', [], request),
    rpc('chain_getHeader', [finalized], request)
  ])
  validateRuntime(runtime)
  validateRuntime(currentRuntime)
  if (runtime.specVersion !== currentRuntime.specVersion) throw new Error('RUNTIME_TRANSITION')
  if (!/^0x[0-9a-f]+$/.test(header?.number)) throw new Error('INVALID_FINALIZED_HEADER')
  return { chain, finalized, runtime: runtime.specVersion, height: Number(BigInt(header.number)) }
}

export function faucetRules(data, now = Date.now()) {
  const agent = data?.faucet?.agent
  const age = now - Date.parse(data?.asOf)
  if (data?.network !== 'testnet' || data.stale !== false || !Number.isFinite(age) ||
      age < -60000 || age > 300000 || data.faucet.status !== 'open' ||
      agent?.claimPath !== '/v1/testnet/agent-claims' || agent.grantFlop !== 10 ||
      agent.rolling24HourCapFlop !== 10 || agent.cooldownSeconds !== 86400 ||
      agent.rolloverRequiresSpend !== true) throw new Error('FAUCET_CLOSED_OR_RULES_CHANGED')
  return agent
}
