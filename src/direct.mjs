import { connectFlopApi } from '@flop-labs/sdk'
import { isHash, json, network, validateRuntime, verifyNetwork } from './network.mjs'

export async function directReadiness({ request = json, connect = connectFlopApi } = {}) {
  const verified = await verifyNetwork(request)
  const catalog = await request(network.gateway + '/v1/models')
  if (!Array.isArray(catalog?.data)) throw new Error('INVALID_GATEWAY_CATALOG')

  const api = await connect(network.ws, undefined, { expectedGenesisHash: network.genesis, timeoutMs: 12000 })
  try {
    const at = await api.at(verified.finalized)
    validateRuntime(at.runtimeVersion.toJSON())
    const models = []
    for (const entry of catalog.data.slice(0, 15)) {
      const meta = entry?.['x-flop']
      const hash = meta?.model_hash
      if (typeof entry?.id !== 'string' || !isHash(hash)) continue
      const [model, policies] = await Promise.all([
        at.query.modelRegistry.models(hash), at.query.modelRegistry.allowedDecodePolicies(hash)
      ])
      if (!model.isSome || model.unwrap().status.toString() !== 'Verified' || !policies.isSome ||
          !Array.from(policies.unwrap(), item => item.toHex()).includes(meta.decode_policy_hash)) continue
      const precisions = Array.from(model.unwrap().supportedPrecisions, item => item.toString())
      const roots = await Promise.all(precisions.map(precision => at.query.modelRegistry.measuredRoots(hash, precision)))
      const measuredPrecisions = precisions.filter((_, index) => roots[index].isSome)
      if (measuredPrecisions.length === 0) continue
      models.push({ model: entry.id, hash, measuredPrecisions })
    }
    let offerFeed = 'unavailable'
    try {
      const feed = await request(network.explorer + '/api/session-offers')
      if (Array.isArray(feed?.data)) offerFeed = feed.data.length ? 'published; signatures not verified' : 'empty'
    } catch (error) {
      if (error.message === 'HTTP_404') offerFeed = 'HTTP 404'
    }
    return {
      finalizedBlock: verified.finalized, height: verified.height, runtime: verified.runtime,
      verifiedModels: models, offerFeed, qualifiedMinerEndpoint: false, paymentEnabled: false
    }
  } finally {
    await api.disconnect()
  }
}
