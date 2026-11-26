import { readFileSync, writeFileSync } from 'node:fs'
import { connectFlopApi } from '@flop-labs/sdk'
import { retryMonitorRead } from './network.mjs'
import { initialize, loadIdentity } from './identity.mjs'
import { mode, monitor } from './monitor.mjs'
import { directReadiness } from './direct.mjs'
import { verifySettlement } from './finality.mjs'
import { estimateInference } from './inference.mjs'
import { reconcileClaim, requestClaim } from './faucet.mjs'

process.umask(0o077)

try {
  const executionMode = mode(process.env.FLOP_MODE)
  const [command = 'monitor', argument] = process.argv.slice(2)
  let result
  switch (command) {
    case 'monitor':
      result = await monitor({ executionMode, publicKey: process.env.FLOP_PUBLIC_KEY,
        journal: process.env.FLOP_JOURNAL, request: retryMonitorRead, connect: connectFlopApi })
      if (argument) writeFileSync(argument, JSON.stringify(result, null, 2) + '\n')
      break
    case 'identity-init':
      if (executionMode === 'HALTED' || !argument) throw new Error('IDENTITY_PATH_REQUIRED_OR_HALTED')
      result = initialize(argument)
      break
    case 'identity-show': {
      const { signClaim, ...identity } = loadIdentity(argument)
      result = identity
      break
    }
    case 'claim': {
      if (executionMode !== 'INTEGRATION_TEST' || argument !== '--owner-approved-unscored') {
        throw new Error('OWNER_OPT_IN_REQUIRED')
      }
      const identity = loadIdentity(process.env.FLOP_KEY_FILE)
      if (identity.publicKey !== process.env.FLOP_PUBLIC_KEY) throw new Error('IDENTITY_MISMATCH')
      result = await requestClaim({ path: process.env.FLOP_JOURNAL, identity, executionMode, approved: true })
      break
    }
    case 'direct-readiness':
      if (executionMode === 'HALTED' || executionMode === 'SCORED_ACTIVE') throw new Error('READ_ONLY_MODE_REQUIRED')
      result = await directReadiness()
      break
    case 'verify-settlement': {
      if (executionMode === 'HALTED' || executionMode === 'SCORED_ACTIVE') throw new Error('READ_ONLY_MODE_REQUIRED')
      const [, channel, blockHash, transactionHash, cap] = process.argv.slice(2)
      if (!/^[1-9][0-9]{0,37}$/.test(cap ?? '')) throw new Error('INVALID_SETTLEMENT_BOUNDS')
      result = await verifySettlement({ channel, blockHash, transactionHash, maxPlanck: BigInt(cap) })
      break
    }
    case 'estimate':
      if (executionMode !== 'INTEGRATION_TEST' || !argument) throw new Error('INTEGRATION_TEST_REQUIRED')
      result = await estimateInference({
        executionMode, model: process.env.FLOP_MODEL, prompt: readFileSync(argument, 'utf8'),
        maxTokens: Number(process.env.FLOP_MAX_TOKENS), maxFlop: process.env.FLOP_MAX_ESTIMATE
      })
      break
    case 'reconcile':
      result = await reconcileClaim(process.env.FLOP_JOURNAL, argument, executionMode)
      break
    default:
      throw new Error('UNKNOWN_COMMAND')
  }
  console.log(JSON.stringify(result, null, 2))
  if (command === 'monitor' && executionMode !== 'HALTED' && !result.chain) process.exitCode = 1
} catch (error) {
  const message = error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message) ?
    error.message : 'OPERATION_FAILED'
  console.error(message)
  process.exitCode = 1
}
