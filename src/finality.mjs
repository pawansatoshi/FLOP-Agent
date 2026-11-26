import { connectFlopApi } from '@flop-labs/sdk'
import { isHash, network, rpc, verifyNetwork } from './network.mjs'

export async function finalizedBlock(blockHash, head) {
  if (!isHash(blockHash)) throw new Error('BLOCK_HASH_REQUIRED')
  const confirmed = head ?? await verifyNetwork()
  const header = await rpc('chain_getHeader', [blockHash])
  if (!/^0x[0-9a-f]+$/.test(header?.number)) throw new Error('INVALID_BLOCK')
  const height = Number(BigInt(header.number))
  if (!Number.isSafeInteger(height) || height > confirmed.height ||
      await rpc('chain_getBlockHash', [height]) !== blockHash) throw new Error('BLOCK_NOT_FINALIZED')
  return height
}

export function eventsForTransaction(block, events, hash) {
  const index = block.block.extrinsics.findIndex(extrinsic => extrinsic.hash.toHex() === hash)
  if (index < 0) throw new Error('TRANSACTION_NOT_IN_BLOCK')
  return events.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === index)
    .map(({ event }) => event)
}

export function settledPayment(events, channel, maxPlanck) {
  if (!isHash(channel) || typeof maxPlanck !== 'bigint' || maxPlanck <= 0n) throw new Error('INVALID_SETTLEMENT_BOUNDS')
  if (!events.some(event => event.section === 'system' && event.method === 'ExtrinsicSuccess')) {
    throw new Error('SETTLEMENT_EXTRINSIC_UNVERIFIED')
  }
  const settlements = events.filter(event => event.section === 'computeChannel' && event.method === 'Settled' &&
    event.data[0].toHex() === channel)
  if (settlements.length !== 1) throw new Error('FINAL_COMPUTE_SETTLEMENT_MISSING')
  const [, paid, burned, work] = settlements[0].data
  const [minerPaid, protocolBurn, aggregateGn] = [paid, burned, work].map(value => BigInt(value.toString()))
  const total = minerPaid + protocolBurn
  if (minerPaid <= 0n || protocolBurn < 0n || aggregateGn <= 0n || total > maxPlanck) {
    throw new Error('SETTLEMENT_AMOUNT_UNVERIFIED')
  }
  return { channel, minerPaidPlanck: minerPaid.toString(), burnedPlanck: protocolBurn.toString(),
    onChainPaymentPlanck: total.toString(), aggregateGn: aggregateGn.toString() }
}

export async function verifySettlement({ channel, blockHash, transactionHash, maxPlanck }) {
  if (!isHash(transactionHash)) throw new Error('TRANSACTION_HASH_REQUIRED')
  const height = await finalizedBlock(blockHash)
  const api = await connectFlopApi(network.ws, undefined, { expectedGenesisHash: network.genesis, timeoutMs: 12000 })
  try {
    const at = await api.at(blockHash)
    const [block, events] = await Promise.all([api.rpc.chain.getBlock(blockHash), at.query.system.events()])
    return { ...settledPayment(eventsForTransaction(block, events, transactionHash), channel, maxPlanck),
      blockHash, transactionHash, height }
  } finally {
    await api.disconnect()
  }
}
