/**
 * Encryption and decryption utilities using Web Crypto API
 * Supports both symmetric (AES-256-GCM) and asymmetric (RSA-OAEP) encryption
 */

const SYMMETRIC_ALGORITHM = 'AES-GCM'
const ASYMMETRIC_ALGORITHM = 'RSA-OAEP'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM
const TAG_LENGTH = 128 // 128 bits for GCM

/**
 * Generate a random symmetric key for AES-GCM
 */
export async function generateSymmetricKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: SYMMETRIC_ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt data using RSA-OAEP (for small data like session keys)
 */
export async function encryptAsymmetric(
  data: string,
  publicKey: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)

  // RSA-OAEP can only encrypt small amounts of data
  // For larger data, we should use hybrid encryption (RSA + AES)
  const encrypted = await crypto.subtle.encrypt(
    {
      name: ASYMMETRIC_ALGORITHM,
    },
    publicKey,
    dataBuffer
  )

  // Convert to base64 for storage/transmission
  return arrayBufferToBase64(encrypted)
}

/**
 * Decrypt data using RSA-OAEP
 */
export async function decryptAsymmetric(
  encryptedData: string,
  privateKey: CryptoKey
): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedData)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: ASYMMETRIC_ALGORITHM,
    },
    privateKey,
    encryptedBuffer
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

/**
 * Encrypt data using AES-GCM (for larger data)
 */
export async function encryptSymmetric(
  data: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    {
      name: SYMMETRIC_ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH,
    },
    key,
    dataBuffer
  )

  return {
    encrypted: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer),
  }
}

/**
 * Decrypt data using AES-GCM
 */
export async function decryptSymmetric(
  encryptedData: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedData)
  const ivBuffer = base64ToArrayBuffer(iv)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: SYMMETRIC_ALGORITHM,
      iv: ivBuffer,
      tagLength: TAG_LENGTH,
    },
    key,
    encryptedBuffer
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

/**
 * Hybrid encryption: Use RSA to encrypt a symmetric key, then AES to encrypt the data
 * This is more efficient for larger messages
 */
export async function encryptHybrid(
  data: string,
  recipientPublicKey: CryptoKey
): Promise<{ encryptedKey: string; encryptedData: string; iv: string }> {
  // Generate a symmetric key for this message
  const sessionKey = await generateSymmetricKey()

  // Encrypt the data with the symmetric key
  const { encrypted, iv } = await encryptSymmetric(data, sessionKey)

  // Export and encrypt the symmetric key with RSA
  const exportedKey = await crypto.subtle.exportKey('raw', sessionKey)
  const keyString = arrayBufferToBase64(exportedKey)
  const encryptedKey = await encryptAsymmetric(keyString, recipientPublicKey)

  return {
    encryptedKey,
    encryptedData: encrypted,
    iv,
  }
}

/**
 * Hybrid decryption: Decrypt the symmetric key with RSA, then decrypt the data with AES
 */
export async function decryptHybrid(
  encryptedKey: string,
  encryptedData: string,
  iv: string,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  // Decrypt the symmetric key
  const keyString = await decryptAsymmetric(encryptedKey, recipientPrivateKey)
  const keyBuffer = base64ToArrayBuffer(keyString)

  // Import the symmetric key
  const sessionKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    {
      name: SYMMETRIC_ALGORITHM,
      length: KEY_LENGTH,
    },
    true,
    ['decrypt']
  )

  // Decrypt the data
  return decryptSymmetric(encryptedData, iv, sessionKey)
}

/**
 * Encrypt a message for a recipient (uses hybrid encryption)
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: CryptoKey
): Promise<string> {
  const result = await encryptHybrid(message, recipientPublicKey)
  return JSON.stringify(result)
}

/**
 * Decrypt a message from a sender
 */
export async function decryptMessage(
  encryptedMessage: string,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  const { encryptedKey, encryptedData, iv } = JSON.parse(encryptedMessage)
  return decryptHybrid(encryptedKey, encryptedData, iv, recipientPrivateKey)
}

// Utility functions - Chrome-compatible base64 encoding for binary data
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  let binary = ''

  // Process in chunks to avoid stack overflow on large data
  const chunkSize = 0x8000 // 32KB chunks
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len))
    binary += String.fromCharCode.apply(null, Array.from(chunk))
  }

  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)

  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

