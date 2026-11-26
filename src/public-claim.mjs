import { readClaim } from './faucet.mjs'
import { publicIdentity } from './identity.mjs'

const publicKey = process.env.FLOP_PUBLIC_KEY
if (!/^[a-f0-9]{64}$/.test(publicKey ?? '')) throw new Error('INVALID_PUBLIC_KEY')
const identity = publicIdentity(Buffer.from(publicKey, 'hex'))
const claim = readClaim(process.argv[2], identity.address)
if (!claim) throw new Error('MATCHING_CLAIM_REQUIRED')
console.log(JSON.stringify({ publicKey, claim }))
