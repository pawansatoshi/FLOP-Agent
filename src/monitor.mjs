import { connectFlopApi } from '@flop-labs/sdk'
import { network, json, verifyNetwork, validateRuntime, faucetRules } from './network.mjs'
import { publicIdentity } from './identity.mjs'

export function mode(value = 'MONITOR_ONLY') {
  if (!['MONITOR_ONLY', 'INTEGRATION_TEST', 'SCORED_ACTIVE', 'HALTED'].includes(value)) {
    throw new Error('INVALID_MODE')
  }
  return value
}

export async function monitor({ executionMode = mode(), publicKey, request = json } = {}) {
  const result = {
    agent: 'FLOP-Agent', mode: executionMode, network: 'testnet', checkedAt: new Date().toISOString(),
    scoring: 'unscored opening; activation block unverified', eligibleActivity: 0,
    spending: 'disabled', errors: []
  }
  if (executionMode === 'HALTED') return result
  if (executionMode === 'SCORED_ACTIVE') throw new Error('SCORING_UNVERIFIED')

  const [chain, faucet, gateway] = await Promise.allSettled([
    verifyNetwork(request), request(network.faucet + '/limits'), request(network.gateway + '/v1/models')
  ])
  if (chain.status === 'fulfilled') {
    const { runtime, finalized, height } = chain.value
    result.chain = { runtime, finalized, height }
  } else result.errors.push('Testnet identity or runtime verification failed')

  if (faucet.status === 'fulfilled' && result.chain) {
    result.faucet = { status: 'unverified', asOf: faucet.value?.asOf }
    try {
      const rules = faucetRules(faucet.value)
      result.faucet = { status: 'open', grantFlop: rules.grantFlop, cooldownSeconds: rules.cooldownSeconds,
        asOf: faucet.value.asOf }
    } catch {
      result.errors.push('Faucet rules or freshness could not be verified')
    }
  } else result.errors.push('Faucet status unavailable')

  if (gateway.status === 'fulfilled' && Array.isArray(gateway.value?.data)) {
    result.gateway = 'catalog reachable'
    result.models = gateway.value.data.filter(entry => typeof entry?.id === 'string').map(entry => ({
      id: entry.id,
      advertisedMiners: [...new Set((Array.isArray(entry['x-flop']?.price_sources) ?
        entry['x-flop'].price_sources : []).map(source => source?.miner_address).filter(
        address => typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{45,50}$/.test(address)))]
    }))
  } else result.errors.push('Gateway catalog unavailable')

  if (publicKey !== undefined && publicKey !== '') {
    if (!/^[0-9a-f]{64}$/.test(publicKey)) throw new Error('INVALID_PUBLIC_KEY')
    result.identity = publicIdentity(Buffer.from(publicKey, 'hex'))
    if (result.chain) {
      let api
      try {
        api = await connectFlopApi(network.ws, undefined, { expectedGenesisHash: network.genesis, timeoutMs: 12000 })
        const at = await api.at(result.chain.finalized)
        validateRuntime(at.runtimeVersion.toJSON())
        const account = await at.query.system.account(result.identity.address)
        result.balance = { freePlanck: account.data.free.toString(), reservedPlanck: account.data.reserved.toString() }
      } catch {
        result.errors.push('Finalized wallet balance unavailable')
      } finally {
        if (api) await api.disconnect()
      }
    }
  }
  return result
}
