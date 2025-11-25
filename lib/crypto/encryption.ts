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
  try {
    console.log('[DecryptAsym] Starting RSA decryption, input length:', encryptedData.length)
    const encryptedBuffer = base64ToArrayBuffer(encryptedData)
    console.log('[DecryptAsym] Converted to buffer, size:', encryptedBuffer.byteLength)

    console.log('[DecryptAsym] Calling crypto.subtle.decrypt...')
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ASYMMETRIC_ALGORITHM,
      },
      privateKey,
      encryptedBuffer
    )
    console.log('[DecryptAsym] Decrypted buffer size:', decrypted.byteLength)

    const decoder = new TextDecoder()
    const result = decoder.decode(decrypted)
    console.log('[DecryptAsym] Decoded to string, length:', result.length)
    return result
  } catch (error) {
    console.error('[DecryptAsym] RSA decryption failed:', error)
    throw error
  }
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
  try {
    console.log('[DecryptSym] Starting AES-GCM decryption')
    console.log('[DecryptSym] Encrypted data length:', encryptedData.length)
    console.log('[DecryptSym] IV length:', iv.length)

    const encryptedBuffer = base64ToArrayBuffer(encryptedData)
    console.log('[DecryptSym] Encrypted buffer size:', encryptedBuffer.byteLength)

    const ivBuffer = base64ToArrayBuffer(iv)
    console.log('[DecryptSym] IV buffer size:', ivBuffer.byteLength)

    console.log('[DecryptSym] Calling crypto.subtle.decrypt...')
    const decrypted = await crypto.subtle.decrypt(
      {
        name: SYMMETRIC_ALGORITHM,
        iv: ivBuffer,
        tagLength: TAG_LENGTH,
      },
      key,
      encryptedBuffer
    )
    console.log('[DecryptSym] Decrypted buffer size:', decrypted.byteLength)

    const decoder = new TextDecoder()
    const result = decoder.decode(decrypted)
    console.log('[DecryptSym] Decoded string length:', result.length)
    return result
  } catch (error) {
    console.error('[DecryptSym] AES-GCM decryption failed:', error)
    throw error
  }
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
  try {
    console.log('[DecryptHybrid] Starting hybrid decryption')

    // Decrypt the symmetric key
    console.log('[DecryptHybrid] Decrypting symmetric key with RSA...')
    const keyString = await decryptAsymmetric(encryptedKey, recipientPrivateKey)
    console.log('[DecryptHybrid] RSA decryption successful, keyString length:', keyString.length)

    console.log('[DecryptHybrid] Converting base64 to ArrayBuffer...')
    const keyBuffer = base64ToArrayBuffer(keyString)
    console.log('[DecryptHybrid] keyBuffer byteLength:', keyBuffer.byteLength)

    // Import the symmetric key
    console.log('[DecryptHybrid] Importing symmetric key...')
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
    console.log('[DecryptHybrid] Symmetric key imported successfully')

    // Decrypt the data
    console.log('[DecryptHybrid] Decrypting data with AES-GCM...')
    const result = await decryptSymmetric(encryptedData, iv, sessionKey)
    console.log('[DecryptHybrid] AES decryption successful')
    return result
  } catch (error) {
    console.error('[DecryptHybrid] Error during hybrid decryption:', error)
    throw error
  }
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
  try {
    console.log('[Decrypt] Starting decryption, encrypted message length:', encryptedMessage.length)
    const parsed = JSON.parse(encryptedMessage)
    console.log('[Decrypt] Parsed message:', {
      hasEncryptedKey: !!parsed.encryptedKey,
      hasEncryptedData: !!parsed.encryptedData,
      hasIv: !!parsed.iv,
      encryptedKeyLength: parsed.encryptedKey?.length,
      encryptedDataLength: parsed.encryptedData?.length,
      ivLength: parsed.iv?.length
    })

    const result = await decryptHybrid(parsed.encryptedKey, parsed.encryptedData, parsed.iv, recipientPrivateKey)
    console.log('[Decrypt] Decryption successful, result length:', result.length)
    return result
  } catch (error) {
    console.error('[Decrypt] Decryption failed:', error)
    console.error('[Decrypt] Error stack:', error instanceof Error ? error.stack : 'No stack')
    throw error
  }
}

// Utility functions - Chrome-compatible base64 encoding for binary data
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    console.log('[Base64] arrayBufferToBase64: buffer size:', buffer.byteLength)
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    let binary = ''

    // Use smaller chunks for better Chrome mobile compatibility
    const chunkSize = 8192 // 8KB chunks
    for (let i = 0; i < len; i += chunkSize) {
      const end = Math.min(i + chunkSize, len)
      const chunk = bytes.subarray(i, end)

      // Avoid String.fromCharCode.apply() which can fail on Chrome mobile
      // Build string directly from chunk
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j])
      }
    }

    const result = btoa(binary)
    console.log('[Base64] arrayBufferToBase64: result length:', result.length)
    return result
  } catch (error) {
    console.error('[Base64] arrayBufferToBase64 failed:', error)
    throw error
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    console.log('[Base64] base64ToArrayBuffer: input length:', base64.length)
    const binary = atob(base64)
    const len = binary.length
    const bytes = new Uint8Array(len)

    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    console.log('[Base64] base64ToArrayBuffer: result byteLength:', bytes.buffer.byteLength)
    return bytes.buffer
  } catch (error) {
    console.error('[Base64] base64ToArrayBuffer failed:', error)
    throw error
  }
}

