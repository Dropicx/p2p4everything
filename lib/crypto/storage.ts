/**
 * Secure key storage using IndexedDB
 * Stores encryption keys with optional master key encryption
 *
 * Note: Key storage is special because we need device RSA keys to bootstrap
 * the master key decryption. So we support both encrypted and unencrypted
 * storage, with migration capability.
 */

import type { ExportedKeyPair } from './keys'
import { encryptData, decryptData, isEncrypted, isUnencrypted } from './indexeddb-encryption'

const DB_NAME = 'p2p4everything-keys'
const DB_VERSION = 2 // Incremented for encryption support
const STORE_NAME = 'keys'

interface StoredKey {
  deviceId: string
  keyPair: ExportedKeyPair
  createdAt: number
}

// Global reference to master key getter function
let getMasterKeyFn: (() => CryptoKey | null) | null = null

/**
 * Initialize the encrypted storage with a master key getter
 * Called from EncryptionProvider once master key is available
 */
export function initializeEncryptedKeyStorage(getMasterKey: () => CryptoKey | null): void {
  getMasterKeyFn = getMasterKey
  console.log('[KeyStorage] Encryption initialized')
}

/**
 * Check if encryption is available for key storage
 */
export function isKeyStorageEncryptionAvailable(): boolean {
  return getMasterKeyFn !== null && getMasterKeyFn() !== null
}

let db: IDBDatabase | null = null

/**
 * Initialize IndexedDB database
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db)
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = database.createObjectStore(STORE_NAME, {
          keyPath: 'deviceId',
        })
        objectStore.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
  })
}

/**
 * Store a key pair for a device
 *
 * IMPORTANT: Device RSA key pairs are stored UNENCRYPTED intentionally.
 * They are needed to bootstrap/decrypt the master key, so they cannot
 * themselves be encrypted with the master key (chicken-and-egg problem).
 *
 * This is acceptable because:
 * 1. The private key never leaves the device
 * 2. The private key is useless without the encrypted master key from server
 * 3. IndexedDB is already sandboxed per-origin
 */
export async function storeKeyPair(
  deviceId: string,
  keyPair: ExportedKeyPair
): Promise<void> {
  const database = await initDB()

  const data: StoredKey = {
    deviceId,
    keyPair,
    createdAt: Date.now(),
  }

  // Store UNENCRYPTED - device keys must be accessible before master key is loaded
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    // Store with deviceId for lookup - use legacy format for compatibility
    const request = store.put({
      deviceId,
      keyPair: data.keyPair,
      createdAt: data.createdAt,
    })

    request.onsuccess = () => {
      console.log(`[KeyStorage] Stored key pair for device ${deviceId}`)
      resolve()
    }

    request.onerror = () => {
      reject(new Error('Failed to store key pair'))
    }
  })
}

/**
 * Retrieve a key pair for a device
 * Device RSA keys are always stored unencrypted (needed for master key bootstrap)
 */
export async function getKeyPair(
  deviceId: string
): Promise<ExportedKeyPair | null> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(deviceId)

    request.onsuccess = async () => {
      const result = request.result
      if (!result) {
        resolve(null)
        return
      }

      try {
        // Check for legacy encrypted format and decrypt if possible
        if (result.data !== undefined) {
          if (isEncrypted(result.data)) {
            // Old encrypted format - try to decrypt and re-save as unencrypted
            const masterKey = getMasterKeyFn?.()
            if (!masterKey) {
              console.log('[KeyStorage] Cannot decrypt key pair - master key not available (bootstrap mode)')
              resolve(null)
              return
            }
            const decrypted = await decryptData<StoredKey>(result.data, masterKey)

            // Re-save as unencrypted for future access
            console.log('[KeyStorage] Migrating encrypted key to unencrypted format...')
            const writeTransaction = database.transaction([STORE_NAME], 'readwrite')
            const writeStore = writeTransaction.objectStore(STORE_NAME)
            writeStore.put({
              deviceId,
              keyPair: decrypted.keyPair,
              createdAt: decrypted.createdAt || Date.now(),
            })

            resolve(decrypted.keyPair)
          } else if (isUnencrypted(result.data)) {
            resolve((result.data as StoredKey).keyPair)
          } else if (typeof result.data === 'object' && result.data.keyPair) {
            resolve(result.data.keyPair)
          } else {
            resolve(null)
          }
        } else if (result.keyPair) {
          // Standard unencrypted format - direct keyPair field
          resolve(result.keyPair)
        } else {
          resolve(null)
        }
      } catch (error) {
        console.error('[KeyStorage] Error reading key pair:', error)
        // Try legacy format as fallback
        if (result.keyPair) {
          resolve(result.keyPair)
        } else {
          reject(error)
        }
      }
    }

    request.onerror = () => {
      reject(new Error('Failed to retrieve key pair'))
    }
  })
}

/**
 * Check if a key pair exists for a device
 */
export async function hasKeyPair(deviceId: string): Promise<boolean> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(deviceId)

    request.onsuccess = () => {
      resolve(request.result !== undefined)
    }

    request.onerror = () => {
      reject(new Error('Failed to check key pair'))
    }
  })
}

/**
 * Delete a key pair for a device
 */
export async function deleteKeyPair(deviceId: string): Promise<void> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(deviceId)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(new Error('Failed to delete key pair'))
    }
  })
}

/**
 * List all stored device IDs
 */
export async function listDeviceIds(): Promise<string[]> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const results = request.result
      resolve(results.map((r: { deviceId: string }) => r.deviceId))
    }

    request.onerror = () => {
      reject(new Error('Failed to list device IDs'))
    }
  })
}

/**
 * Clear all stored keys (use with caution!)
 */
export async function clearAllKeys(): Promise<void> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(new Error('Failed to clear keys'))
    }
  })
}

/**
 * Migrate encrypted keys back to unencrypted format
 *
 * Device RSA keys should NOT be encrypted because they're needed to
 * bootstrap the master key. This function converts any previously
 * encrypted keys back to unencrypted format.
 */
export async function migrateKeysToEncrypted(): Promise<number> {
  // This function now does the OPPOSITE - it decrypts any encrypted keys
  // because device RSA keys should not be encrypted (needed for bootstrap)
  const masterKey = getMasterKeyFn?.()
  if (!masterKey) {
    console.log('[KeyStorage] Skipping key migration - master key not available')
    return 0
  }

  const database = await initDB()

  // Collect encrypted items
  interface MigrationItem {
    deviceId: string
    encryptedData: string
  }
  const itemsToMigrate: MigrationItem[] = []

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const item = cursor.value

        // Check if encrypted (needs to be decrypted)
        if (item.data !== undefined && isEncrypted(item.data)) {
          itemsToMigrate.push({
            deviceId: item.deviceId,
            encryptedData: item.data,
          })
        }

        cursor.continue()
      } else {
        resolve()
      }
    }

    request.onerror = () => {
      reject(new Error('Key migration scan failed'))
    }
  })

  if (itemsToMigrate.length === 0) {
    console.log('[KeyStorage] No encrypted keys to migrate')
    return 0
  }

  console.log(`[KeyStorage] Found ${itemsToMigrate.length} encrypted keys to decrypt`)

  // Decrypt and re-save as unencrypted
  let migratedCount = 0
  for (const item of itemsToMigrate) {
    try {
      const decrypted = await decryptData<StoredKey>(item.encryptedData, masterKey)

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        // Save in unencrypted format
        const request = store.put({
          deviceId: item.deviceId,
          keyPair: decrypted.keyPair,
          createdAt: decrypted.createdAt || Date.now(),
        })

        request.onsuccess = () => {
          migratedCount++
          console.log(`[KeyStorage] Decrypted key for device ${item.deviceId}`)
          resolve()
        }

        request.onerror = () => {
          reject(new Error(`Failed to decrypt key for device ${item.deviceId}`))
        }
      })
    } catch (error) {
      console.error(`[KeyStorage] Failed to decrypt key for device ${item.deviceId}:`, error)
    }
  }

  console.log(`[KeyStorage] Migration complete: ${migratedCount} keys decrypted`)
  return migratedCount
}
