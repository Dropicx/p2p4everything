/**
 * Encryption key generation and management using Web Crypto API
 * Generates RSA-OAEP 4096-bit key pairs for E2E encryption
 */

export interface KeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

export interface ExportedKeyPair {
  publicKey: string // JWK format
  privateKey: string // JWK format
}

const KEY_ALGORITHM = 'RSA-OAEP'
const KEY_LENGTH = 4096
const HASH_ALGORITHM = 'SHA-256'

/**
 * Generate a new RSA-OAEP key pair for encryption
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: KEY_ALGORITHM,
      modulusLength: KEY_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: HASH_ALGORITHM,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  )

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  }
}

/**
 * Export a key pair to JWK format for storage
 */
export async function exportKeyPair(keyPair: KeyPair): Promise<ExportedKeyPair> {
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
  ])

  return {
    publicKey: JSON.stringify(publicKeyJwk),
    privateKey: JSON.stringify(privateKeyJwk),
  }
}

/**
 * Import a key pair from JWK format
 */
export async function importKeyPair(
  exported: ExportedKeyPair
): Promise<KeyPair> {
  const publicKeyJwk = JSON.parse(exported.publicKey)
  const privateKeyJwk = JSON.parse(exported.privateKey)

  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      {
        name: KEY_ALGORITHM,
        hash: HASH_ALGORITHM,
      },
      true,
      ['encrypt']
    ),
    crypto.subtle.importKey(
      'jwk',
      privateKeyJwk,
      {
        name: KEY_ALGORITHM,
        hash: HASH_ALGORITHM,
      },
      true,
      ['decrypt']
    ),
  ])

  return { publicKey, privateKey }
}

/**
 * Export only the public key to JWK format (for sharing)
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey)
  return JSON.stringify(jwk)
}

/**
 * Import a public key from JWK format
 */
export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString)
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: KEY_ALGORITHM,
      hash: HASH_ALGORITHM,
    },
    true,
    ['encrypt']
  )
}

/**
 * Calculate a fingerprint (hash) of a public key for verification
 */
export async function getKeyFingerprint(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey)
  const jwkString = JSON.stringify(jwk)
  const encoder = new TextEncoder()
  const data = encoder.encode(jwkString)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 32)
}

