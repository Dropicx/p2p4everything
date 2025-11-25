/**
 * Master key management for IndexedDB encryption
 * The master key is used to encrypt all IndexedDB data
 * It is stored encrypted on the server and only held in memory on the client
 */

const MASTER_KEY_ALGORITHM = 'AES-GCM'
const MASTER_KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 100000
const PBKDF2_HASH = 'SHA-256'
const IV_LENGTH = 12

/**
 * Generate a new master encryption key
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: MASTER_KEY_ALGORITHM,
      length: MASTER_KEY_LENGTH,
    },
    true, // extractable - needed for export
    ['encrypt', 'decrypt']
  )
}

/**
 * Export master key to raw bytes for storage
 */
export async function exportMasterKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey('raw', key)
}

/**
 * Import master key from raw bytes
 */
export async function importMasterKey(keyData: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyData,
    {
      name: MASTER_KEY_ALGORITHM,
      length: MASTER_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt master key with device's RSA public key
 * Returns base64-encoded encrypted key
 */
export async function encryptMasterKeyForDevice(
  masterKey: CryptoKey,
  devicePublicKey: CryptoKey
): Promise<string> {
  const masterKeyBytes = await exportMasterKey(masterKey)

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    devicePublicKey,
    masterKeyBytes
  )

  return arrayBufferToBase64(encrypted)
}

/**
 * Decrypt master key using device's RSA private key
 */
export async function decryptMasterKeyFromDevice(
  encryptedKey: string,
  devicePrivateKey: CryptoKey
): Promise<CryptoKey> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedKey)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    devicePrivateKey,
    encryptedBuffer
  )

  return importMasterKey(decrypted)
}

/**
 * Generate random salt for PBKDF2 key derivation
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(32)
  crypto.getRandomValues(salt)
  return salt
}

/**
 * Derive backup encryption key from Clerk session token
 * Uses PBKDF2 with high iteration count for security
 */
export async function deriveBackupKey(
  sessionToken: string,
  clerkUserId: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder()

  // Combine session token and user ID for the password
  const password = `${sessionToken}:${clerkUserId}`
  const passwordBytes = encoder.encode(password)

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  // Derive the backup key - use .buffer to get ArrayBuffer
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    {
      name: MASTER_KEY_ALGORITHM,
      length: MASTER_KEY_LENGTH,
    },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt master key for backup storage
 * Uses AES-GCM with the derived backup key
 */
export async function encryptMasterKeyForBackup(
  masterKey: CryptoKey,
  backupKey: CryptoKey
): Promise<string> {
  const masterKeyBytes = await exportMasterKey(masterKey)

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    {
      name: MASTER_KEY_ALGORITHM,
      iv: iv,
    },
    backupKey,
    masterKeyBytes
  )

  // Combine IV and encrypted data for storage
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)

  return arrayBufferToBase64(combined.buffer)
}

/**
 * Decrypt master key from backup storage
 */
export async function decryptMasterKeyFromBackup(
  encryptedKey: string,
  backupKey: CryptoKey
): Promise<CryptoKey> {
  const combined = base64ToArrayBuffer(encryptedKey)
  const combinedArray = new Uint8Array(combined)

  // Extract IV and encrypted data
  const iv = combinedArray.slice(0, IV_LENGTH)
  const encrypted = combinedArray.slice(IV_LENGTH)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: MASTER_KEY_ALGORITHM,
      iv: iv,
    },
    backupKey,
    encrypted
  )

  return importMasterKey(decrypted)
}

/**
 * Export salt to base64 string for storage
 */
export function exportSalt(salt: Uint8Array): string {
  return arrayBufferToBase64(salt.buffer as ArrayBuffer)
}

/**
 * Import salt from base64 string
 */
export function importSalt(saltString: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(saltString))
}

// Utility functions for base64 encoding/decoding
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  let binary = ''

  // Use smaller chunks for better compatibility
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    const end = Math.min(i + chunkSize, len)
    const chunk = bytes.subarray(i, end)

    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j])
    }
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
