import { connectFlopApi } from '@flop-labs/sdk'
import { network, json, verifyNetwork, validateRuntime, faucetRules, publicReadFailure } from './network.mjs'
import { readClaim } from './faucet.mjs'
import { publicIdentity } from './identity.mjs'

export function mode(value = 'MONITOR_ONLY') {
  if (!['MONITOR_ONLY', 'INTEGRATION_TEST', 'SCORED_ACTIVE', 'HALTED'].includes(value)) {
    throw new Error('INVALID_MODE')
  }
  return value
}

export async function monitor({ executionMode = mode(), publicKey, request = json, journal, connect } = {}) {
  const result = {
    agent: 'FLOP-Agent', mode: executionMode, network: 'testnet', checkedAt: new Date().toISOString(),
    scoring: 'unscored opening; activation block unverified', eligibleActivity: 0,
    spending: 'disabled', errors: []
  }
  if (executionMode === 'HALTED') return result
  if (executionMode === 'SCORED_ACTIVE') throw new Error('SCORING_UNVERIFIED')

  const [chain, faucet, gateway] = await Promise.allSettled([
    verifyNetwork(request, connect ?? (request === json ? connectFlopApi : undefined)),
    request(network.faucet + '/limits'), request(network.gateway + '/v1/models')
  ])
  if (chain.status === 'fulfilled') {
    const { runtime, finalized, height } = chain.value
    result.chain = { runtime, finalized, height }
  } else result.errors.push('Testnet identity or runtime verification failed: ' + publicReadFailure(chain.reason))

  if (faucet.status === 'fulfilled') {
    result.faucet = { status: 'unverified', asOf: faucet.value?.asOf }
    try {
      const rules = faucetRules(faucet.value)
      if (result.chain) {
        result.faucet = { status: 'open', grantFlop: rules.grantFlop, cooldownSeconds: rules.cooldownSeconds,
          asOf: faucet.value.asOf }
      } else result.errors.push('Faucet limits available; chain identity must verify before use')
    } catch {
      result.errors.push('Faucet rules or freshness could not be verified')
    }
  } else result.errors.push('Faucet status unavailable: ' + publicReadFailure(faucet.reason))

  if (gateway.status === 'fulfilled' && Array.isArray(gateway.value?.data)) {
    result.gateway = 'catalog reachable'
    result.models = gateway.value.data.filter(entry => typeof entry?.id === 'string').map(entry => ({
      id: entry.id,
      advertisedMiners: [...new Set((Array.isArray(entry['x-flop']?.price_sources) ?
        entry['x-flop'].price_sources : []).map(source => source?.miner_address).filter(
        address => typeof address === 'string' && /^[1-9A-HJ-NP-Za-km-z]{45,50}$/.test(address)))]
    }))
  } else result.errors.push('Gateway catalog unavailable: ' + (gateway.status === 'rejected' ?
    publicReadFailure(gateway.reason) : 'INVALID_CATALOG'))

  if (publicKey !== undefined && publicKey !== '') {
    if (!/^[0-9a-f]{64}$/.test(publicKey)) throw new Error('INVALID_PUBLIC_KEY')
    result.identity = publicIdentity(Buffer.from(publicKey, 'hex'))
    try {
      result.claim = readClaim(journal, result.identity.address)
    } catch {
      result.errors.push('Public faucet journal unavailable')
    }
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
