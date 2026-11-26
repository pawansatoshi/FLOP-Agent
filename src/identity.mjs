import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { d10AgentClaimMessage } from '@flop-labs/sdk'
import { createHash } from 'node:crypto'

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export function base58(bytes) {
  let number = BigInt('0x' + Buffer.from(bytes).toString('hex'))
  let result = ''
  while (number) {
    result = alphabet[Number(number % 58n)] + result
    number /= 58n
  }
  for (const byte of bytes) {
    if (byte !== 0) break
    result = '1' + result
  }
  return result
}

export function publicIdentity(publicKey) {
  if (publicKey.length !== 32) throw new Error('INVALID_PUBLIC_KEY')
  const payload = Buffer.concat([Buffer.from([42]), publicKey])
  const checksum = createHash('blake2b512').update('SS58PRE').update(payload).digest().subarray(0, 2)
  return {
    name: 'FLOP-Agent',
    publicKey: Buffer.from(publicKey).toString('hex'),
    address: base58(Buffer.concat([payload, checksum])),
    did: 'did:key:z' + base58(Buffer.concat([Buffer.from([0xed, 0x01]), publicKey]))
  }
}

export function identityFromSeed(seed) {
  if (seed.length !== 32) throw new Error('INVALID_SEED')
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed])
  let key
  try {
    key = createPrivateKey({ key: der, type: 'pkcs8', format: 'der' })
  } finally {
    der.fill(0)
  }
  const publicKey = createPublicKey(key)
  const identity = publicIdentity(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32))
  return {
    ...identity,
    signClaim(nonce) {
      if (!/^(0|[1-9][0-9]{0,18})$/.test(nonce)) throw new Error('INVALID_NONCE')
      const message = Buffer.from(d10AgentClaimMessage(identity.address, nonce))
      const signature = sign(null, message, key)
      if (!verify(null, message, publicKey, signature)) throw new Error('SIGNATURE_CHECK_FAILED')
      return '0x' + signature.toString('hex')
    }
  }
}

export function initialize(path) {
  const seed = randomBytes(32)
  try {
    writeFileSync(path, seed, { flag: 'wx', mode: 0o600 })
    return publicIdentity(Buffer.from(identityFromSeed(seed).publicKey, 'hex'))
  } finally {
    seed.fill(0)
  }
}

export function loadIdentity(path) {
  if (!path || !statSync(path).isFile() || (statSync(path).mode & 0o077)) throw new Error('KEY_FILE_PERMISSIONS')
  const seed = readFileSync(path)
  try {
    return identityFromSeed(seed)
  } finally {
    seed.fill(0)
  }
}
