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
 * Encrypts data if master key is available
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

  // Encrypt if master key is available
  let storedData: StoredKey | string = data
  const masterKey = getMasterKeyFn?.()
  if (masterKey) {
    try {
      storedData = await encryptData(data, masterKey)
      console.log(`[KeyStorage] Stored encrypted key pair for device ${deviceId}`)
    } catch (error) {
      console.warn('[KeyStorage] Failed to encrypt, storing unencrypted:', error)
      storedData = data
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    // Store with deviceId for lookup
    const request = store.put({
      deviceId,
      data: storedData,
    })

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(new Error('Failed to store key pair'))
    }
  })
}

/**
 * Retrieve a key pair for a device
 * Handles both encrypted and unencrypted data
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
        // Check for new format with 'data' field
        if (result.data !== undefined) {
          // Encrypted format
          if (isEncrypted(result.data)) {
            const masterKey = getMasterKeyFn?.()
            if (!masterKey) {
              // Can't decrypt without master key - this is expected during bootstrap
              console.log('[KeyStorage] Cannot decrypt key pair - master key not available (bootstrap mode)')
              resolve(null)
              return
            }
            const decrypted = await decryptData<StoredKey>(result.data, masterKey)
            resolve(decrypted.keyPair)
          } else if (isUnencrypted(result.data)) {
            // Unencrypted object in data field
            resolve((result.data as StoredKey).keyPair)
          } else if (typeof result.data === 'object' && result.data.keyPair) {
            // Direct object in data field
            resolve(result.data.keyPair)
          } else {
            resolve(null)
          }
        } else if (result.keyPair) {
          // Legacy format - direct keyPair field
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
 * Migrate unencrypted keys to encrypted format
 * Should be called once master key is available
 *
 * Note: We collect items first, then migrate in separate transactions
 * to avoid IndexedDB transaction timeout issues with async operations
 */
export async function migrateKeysToEncrypted(): Promise<number> {
  const masterKey = getMasterKeyFn?.()
  if (!masterKey) {
    console.log('[KeyStorage] Cannot migrate - master key not available')
    return 0
  }

  const database = await initDB()

  // Step 1: Collect all items that need migration (synchronously)
  interface MigrationItem {
    deviceId: string
    keyPairData: StoredKey
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

        // Check if needs migration
        const needsMigration =
          // Legacy format with direct keyPair
          (item.keyPair && !item.data) ||
          // New format but not encrypted
          (item.data && !isEncrypted(item.data))

        if (needsMigration) {
          // Extract the key pair data for migration
          const keyPairData: StoredKey = item.keyPair
            ? {
                deviceId: item.deviceId,
                keyPair: item.keyPair,
                createdAt: item.createdAt || Date.now(),
              }
            : (item.data as StoredKey)

          itemsToMigrate.push({
            deviceId: item.deviceId,
            keyPairData,
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
    console.log('[KeyStorage] No keys need migration')
    return 0
  }

  console.log(`[KeyStorage] Found ${itemsToMigrate.length} keys to migrate`)

  // Step 2: Migrate each item in its own transaction
  let migratedCount = 0
  for (const item of itemsToMigrate) {
    try {
      // Encrypt the data (async operation outside of transaction)
      const encrypted = await encryptData(item.keyPairData, masterKey)

      // Write in a new transaction
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        const request = store.put({
          deviceId: item.deviceId,
          data: encrypted,
        })

        request.onsuccess = () => {
          migratedCount++
          console.log(`[KeyStorage] Migrated key for device ${item.deviceId}`)
          resolve()
        }

        request.onerror = () => {
          reject(new Error(`Failed to update key for device ${item.deviceId}`))
        }
      })
    } catch (error) {
      console.error(`[KeyStorage] Failed to migrate key for device ${item.deviceId}:`, error)
    }
  }

  console.log(`[KeyStorage] Migration complete: ${migratedCount} keys migrated`)
  return migratedCount
}
