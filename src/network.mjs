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
