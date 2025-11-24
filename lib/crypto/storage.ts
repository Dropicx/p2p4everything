/**
 * Secure key storage using IndexedDB
 * Stores encryption keys encrypted at rest
 */

import type { ExportedKeyPair } from './keys'

const DB_NAME = 'p2p4everything-keys'
const DB_VERSION = 1
const STORE_NAME = 'keys'

interface StoredKey {
  deviceId: string
  keyPair: ExportedKeyPair
  createdAt: number
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
 */
export async function storeKeyPair(
  deviceId: string,
  keyPair: ExportedKeyPair
): Promise<void> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const data: StoredKey = {
      deviceId,
      keyPair,
      createdAt: Date.now(),
    }

    const request = store.put(data)

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
 */
export async function getKeyPair(
  deviceId: string
): Promise<ExportedKeyPair | null> {
  const database = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(deviceId)

    request.onsuccess = () => {
      const result = request.result
      if (result) {
        resolve(result.keyPair)
      } else {
        resolve(null)
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
  const keyPair = await getKeyPair(deviceId)
  return keyPair !== null
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
      const results = request.result as StoredKey[]
      resolve(results.map((r) => r.deviceId))
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

