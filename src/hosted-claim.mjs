import { execFileSync } from 'node:child_process'
import { identityFromSeed } from './identity.mjs'
import { readClaim, reconcileClaim, requestClaim } from './faucet.mjs'
import { publicIdentity } from './identity.mjs'
import { mode } from './monitor.mjs'
import { isHash } from './network.mjs'

process.umask(0o077)

try {
  const executionMode = mode(process.env.FLOP_MODE)
  const [action, journal, blockHash] = process.argv.slice(2)
  if (executionMode !== 'INTEGRATION_TEST') throw new Error('INTEGRATION_TEST_REQUIRED')
  const publicKey = process.env.FLOP_PUBLIC_KEY
  if (!/^[a-f0-9]{64}$/.test(publicKey ?? '')) throw new Error('INVALID_PUBLIC_KEY')
  const expected = publicIdentity(Buffer.from(publicKey, 'hex'))
  const checkpoint = async path => {
    const env = { ...process.env }
    delete env.FLOP_ED25519_SEED
    execFileSync('bash', ['scripts/claim-journal.sh', 'push', path], { env, stdio: 'pipe', timeout: 40000 })
  }
  if (action === 'reconcile') {
    if (!isHash(blockHash) || !readClaim(journal, expected.address)) throw new Error('MATCHING_CLAIM_REQUIRED')
    await reconcileClaim(journal, blockHash, executionMode, checkpoint)
  } else if (action === 'start' || action === 'resume') {
    const checkControl = async () => {
      const env = { ...process.env }
      delete env.FLOP_ED25519_SEED
      try {
        execFileSync('bash', ['scripts/control.sh', 'check'], { env, stdio: 'pipe', timeout: 15000 })
      } catch {
        throw new Error('SIGNER_STOPPED_OR_CONTROL_UNAVAILABLE')
      }
    }
    await checkControl()
    const encoded = process.env.FLOP_ED25519_SEED
    delete process.env.FLOP_ED25519_SEED
    if (!/^[a-f0-9]{64}$/.test(encoded ?? '')) throw new Error('SIGNING_SECRET_REQUIRED')
    const seed = Buffer.from(encoded, 'hex')
    try {
      const identity = identityFromSeed(seed)
      seed.fill(0)
      if (identity.publicKey !== publicKey) throw new Error('IDENTITY_MISMATCH')
      const claim = await requestClaim({ path: journal, identity, executionMode, approved: true, checkpoint,
        resumeOnly: action === 'resume', beforeSubmit: checkControl })
      if (claim.status === 'pending' && isHash(claim.hash)) {
        await reconcileClaim(journal, undefined, executionMode, checkpoint)
      }
    } finally {
      seed.fill(0)
    }
  } else throw new Error('INVALID_ACTION')
  console.log(JSON.stringify(readClaim(journal, expected.address) ?? { status: 'awaiting-manual-start' }, null, 2))
} catch (error) {
  console.error(error instanceof Error && /^[A-Z][A-Z0-9_]{2,63}$/.test(error.message) ?
    error.message : 'HOSTED_CLAIM_FAILED')
  process.exitCode = 1
}
