/**
 * IndexedDB encryption wrapper
 * Provides transparent encryption/decryption for all IndexedDB operations
 * Uses AES-256-GCM with a master key stored only in memory
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12
const ENCRYPTED_PREFIX = 'ENC:' // Prefix to identify encrypted data

/**
 * Error thrown when encryption is not available (user not logged in)
 */
export class EncryptionUnavailableError extends Error {
  constructor(message = 'Encryption key not available. Please log in.') {
    super(message)
    this.name = 'EncryptionUnavailableError'
  }
}

/**
 * Encrypt data using AES-GCM with the master key
 * Returns a base64 string with IV prepended
 */
export async function encryptData(data: unknown, masterKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder()
  const jsonString = JSON.stringify(data)
  const dataBuffer = encoder.encode(jsonString)

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    {
      name: ENCRYPTION_ALGORITHM,
      iv: iv,
    },
    masterKey,
    dataBuffer
  )

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)

  // Return with prefix to identify encrypted data
  return ENCRYPTED_PREFIX + arrayBufferToBase64(combined.buffer)
}

/**
 * Decrypt data using AES-GCM with the master key
 * Returns the original data object
 */
export async function decryptData<T>(encryptedData: string, masterKey: CryptoKey): Promise<T> {
  // Check for encrypted prefix
  if (!encryptedData.startsWith(ENCRYPTED_PREFIX)) {
    throw new Error('Data is not encrypted or has invalid format')
  }

  const base64Data = encryptedData.slice(ENCRYPTED_PREFIX.length)
  const combined = base64ToArrayBuffer(base64Data)
  const combinedArray = new Uint8Array(combined)

  // Extract IV and encrypted data
  const iv = combinedArray.slice(0, IV_LENGTH)
  const encrypted = combinedArray.slice(IV_LENGTH)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: ENCRYPTION_ALGORITHM,
      iv: iv,
    },
    masterKey,
    encrypted
  )

  const decoder = new TextDecoder()
  const jsonString = decoder.decode(decrypted)
  return JSON.parse(jsonString) as T
}

/**
 * Check if data is encrypted (has the encryption prefix)
 */
export function isEncrypted(data: unknown): boolean {
  return typeof data === 'string' && data.startsWith(ENCRYPTED_PREFIX)
}

/**
 * Check if data is unencrypted (legacy data that needs migration)
 * Tries to detect if the data is a plain object/array
 */
export function isUnencrypted(data: unknown): boolean {
  if (data === null || data === undefined) {
    return false
  }

  // If it's a string starting with our prefix, it's encrypted
  if (isEncrypted(data)) {
    return false
  }

  // If it's an object or array, it's unencrypted
  if (typeof data === 'object') {
    return true
  }

  // Try parsing as JSON to detect unencrypted strings
  if (typeof data === 'string') {
    try {
      JSON.parse(data)
      return true
    } catch {
      return false
    }
  }

  return false
}

/**
 * Encrypted IndexedDB store wrapper
 * Provides encrypted versions of common IndexedDB operations
 */
export class EncryptedStore {
  private dbName: string
  private storeName: string
  private getMasterKey: () => CryptoKey | null
  private dbVersion: number
  private indexes: Array<{ name: string; keyPath: string | string[]; unique: boolean }>

  constructor(
    dbName: string,
    storeName: string,
    getMasterKey: () => CryptoKey | null,
    dbVersion: number = 1,
    indexes: Array<{ name: string; keyPath: string | string[]; unique: boolean }> = []
  ) {
    this.dbName = dbName
    this.storeName = storeName
    this.getMasterKey = getMasterKey
    this.dbVersion = dbVersion
    this.indexes = indexes
  }

  /**
   * Check if encryption is currently available
   */
  isEncryptionAvailable(): boolean {
    return this.getMasterKey() !== null
  }

  /**
   * Require encryption to be available, throw error if not
   */
  private requireEncryption(): CryptoKey {
    const key = this.getMasterKey()
    if (!key) {
      throw new EncryptionUnavailableError()
    }
    return key
  }

  /**
   * Open the IndexedDB database
   */
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${this.dbName}`))
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' })

          // Create indexes
          for (const index of this.indexes) {
            store.createIndex(index.name, index.keyPath, { unique: index.unique })
          }
        }
      }
    })
  }

  /**
   * Store an encrypted item
   */
  async put(id: string, data: unknown): Promise<void> {
    const masterKey = this.requireEncryption()
    const db = await this.openDatabase()

    // Encrypt the data
    const encryptedData = await encryptData(data, masterKey)

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)

      // Store with the ID as key and encrypted data as value
      const request = store.put({ id, data: encryptedData })

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        reject(new Error(`Failed to store item: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Get and decrypt an item by ID
   */
  async get<T>(id: string): Promise<T | null> {
    const masterKey = this.requireEncryption()
    const db = await this.openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(id)

      request.onsuccess = async () => {
        const result = request.result
        if (!result) {
          resolve(null)
          return
        }

        try {
          // Handle encrypted data
          if (isEncrypted(result.data)) {
            const decrypted = await decryptData<T>(result.data, masterKey)
            resolve(decrypted)
          } else if (isUnencrypted(result.data)) {
            // Legacy unencrypted data - return as-is for migration
            resolve(result.data as T)
          } else {
            resolve(null)
          }
        } catch (error) {
          reject(error)
        }
      }

      request.onerror = () => {
        reject(new Error(`Failed to retrieve item: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Delete an item by ID
   */
  async delete(id: string): Promise<void> {
    const db = await this.openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(id)

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        reject(new Error(`Failed to delete item: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Get all items (decrypted)
   */
  async getAll<T>(): Promise<T[]> {
    const masterKey = this.requireEncryption()
    const db = await this.openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = async () => {
        const results = request.result
        const decrypted: T[] = []

        for (const item of results) {
          try {
            if (isEncrypted(item.data)) {
              const data = await decryptData<T>(item.data, masterKey)
              decrypted.push(data)
            } else if (isUnencrypted(item.data)) {
              decrypted.push(item.data as T)
            }
          } catch (error) {
            console.error('[EncryptedStore] Failed to decrypt item:', error)
            // Skip items that fail to decrypt
          }
        }

        resolve(decrypted)
      }

      request.onerror = () => {
        reject(new Error(`Failed to get all items: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Count items in the store
   */
  async count(): Promise<number> {
    const db = await this.openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.count()

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        reject(new Error(`Failed to count items: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Clear all items from the store
   */
  async clear(): Promise<void> {
    const db = await this.openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.clear()

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        reject(new Error(`Failed to clear store: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Check if an item exists
   */
  async has(id: string): Promise<boolean> {
    const db = await this.openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(id)

      request.onsuccess = () => {
        resolve(request.result !== undefined)
      }

      request.onerror = () => {
        reject(new Error(`Failed to check item: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Get all IDs in the store
   */
  async getAllIds(): Promise<string[]> {
    const db = await this.openDatabase()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAllKeys()

      request.onsuccess = () => {
        resolve(request.result as string[])
      }

      request.onerror = () => {
        reject(new Error(`Failed to get all IDs: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }

  /**
   * Migrate unencrypted data to encrypted format
   * Returns the number of items migrated
   */
  async migrateToEncrypted(): Promise<number> {
    const masterKey = this.requireEncryption()
    const db = await this.openDatabase()
    let migratedCount = 0

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.openCursor()

      request.onsuccess = async (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

        if (cursor) {
          const item = cursor.value

          // Check if data needs migration
          if (!isEncrypted(item.data) && isUnencrypted(item.data)) {
            try {
              // Encrypt the data
              const encryptedData = await encryptData(item.data, masterKey)

              // Update with encrypted data
              cursor.update({ ...item, data: encryptedData })
              migratedCount++

              console.log(`[EncryptedStore] Migrated item ${item.id}`)
            } catch (error) {
              console.error(`[EncryptedStore] Failed to migrate item ${item.id}:`, error)
            }
          }

          cursor.continue()
        } else {
          console.log(`[EncryptedStore] Migration complete: ${migratedCount} items migrated`)
          resolve(migratedCount)
        }
      }

      request.onerror = () => {
        reject(new Error(`Migration failed: ${request.error}`))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    })
  }
}

// Utility functions for base64 encoding/decoding
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  let binary = ''

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
