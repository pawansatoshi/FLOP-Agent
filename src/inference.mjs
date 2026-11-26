import { json, network, verifyNetwork } from './network.mjs'

function planck(value) {
  const text = String(value)
  const parts = /^(\d+)(?:\.(\d{1,18}))?$/.exec(text)
  if (!parts) throw new Error('INVALID_FLOP_AMOUNT')
  return BigInt(parts[1]) * 10n ** 18n + BigInt((parts[2] ?? '').padEnd(18, '0'))
}

export async function estimateInference({ executionMode, model, prompt, maxTokens, maxFlop, request = json }) {
  if (executionMode !== 'INTEGRATION_TEST') throw new Error('INTEGRATION_TEST_REQUIRED')
  if (typeof model !== 'string' || !/^[a-z0-9._/-]{1,128}$/.test(model) ||
      typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000 ||
      !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 512) {
    throw new Error('INVALID_ESTIMATE_INPUT')
  }
  const cap = planck(maxFlop)
  if (cap <= 0n) throw new Error('INVALID_SPENDING_CAP')
  await verifyNetwork(request)
  const catalog = await request(network.gateway + '/v1/models')
  if (!Array.isArray(catalog?.data) || !catalog.data.some(entry => entry?.id === model)) {
    throw new Error('MODEL_UNAVAILABLE')
  }
  const estimate = await request(network.gateway + '/v1/models/estimate', { model, prompt, max_tokens: maxTokens })
  if (estimate?.model !== model || !Number.isSafeInteger(estimate.available_miners) ||
      estimate.available_miners < 1) throw new Error('MINERS_UNAVAILABLE')
  const price = planck(estimate.estimated_cost_flop)
  const recommended = planck(estimate.recommended_payment)
  if (price > cap || recommended > cap) throw new Error('SPENDING_CAP_EXCEEDED')
  return { model, availableMiners: estimate.available_miners, estimatedPlanck: price.toString(),
    recommendedPlanck: recommended.toString(), capPlanck: cap.toString(), spendingAuthorized: false }
}
