/**
 * Client-side encrypted message storage using IndexedDB
 * Provides persistent storage for encrypted messages with 30-day auto-cleanup
 *
 * Messages are stored with optional master key encryption.
 * The encryptedContent field is already encrypted with E2E encryption;
 * the master key encryption adds a second layer for all fields.
 */

import { encryptData, decryptData, isEncrypted } from './indexeddb-encryption'

const DB_NAME = 'p2p4everything-messages'
const DB_VERSION = 3 // Incremented for master key encryption
const STORE_NAME = 'messages'
const DAYS_TO_KEEP = 30

export interface StoredMessage {
  messageId: string // Primary key
  conversationId: string // Indexed for efficient queries
  senderId: string
  receiverId: string
  encryptedContent: string // E2E encrypted message content
  timestamp: number // Unix timestamp in milliseconds
  isSent: boolean // true if sent by this user, false if received
  isRead?: boolean // true if message has been read (default: false for received, true for sent)
  metadataId?: string // Optional link to server metadata
}

// Internal storage format that includes encryption wrapper
interface StoredMessageRecord {
  messageId: string // Primary key (always unencrypted for lookups)
  conversationId: string // Index field (always unencrypted for queries)
  timestamp: number // Index field (always unencrypted for queries)
  data: string | StoredMessage // Encrypted string or unencrypted message
}

// Global reference to master key getter function
let getMasterKeyFn: (() => CryptoKey | null) | null = null

/**
 * Initialize the encrypted storage with a master key getter
 * Called from EncryptionProvider once master key is available
 */
export function initializeEncryptedMessageStorage(getMasterKey: () => CryptoKey | null): void {
  getMasterKeyFn = getMasterKey
  console.log('[MessageStorage] Encryption initialized')
}

/**
 * Check if encryption is available for message storage
 */
export function isMessageStorageEncryptionAvailable(): boolean {
  return getMasterKeyFn !== null && getMasterKeyFn() !== null
}

/**
 * Open or create the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Failed to open message database'))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'messageId' })

        // Create index on conversationId for efficient queries
        store.createIndex('conversationId', 'conversationId', { unique: false })

        // Create index on timestamp for cleanup operations
        store.createIndex('timestamp', 'timestamp', { unique: false })

        // Compound index for querying specific conversation by time
        store.createIndex('conversationTimestamp', ['conversationId', 'timestamp'], { unique: false })
      }
    }
  })
}

/**
 * Encrypt message data for storage (excluding index fields)
 */
async function encryptMessageData(message: StoredMessage): Promise<string | StoredMessage> {
  const masterKey = getMasterKeyFn?.()
  if (!masterKey) {
    // Store unencrypted if no master key
    return message
  }

  try {
    return await encryptData(message, masterKey)
  } catch (error) {
    console.warn('[MessageStorage] Encryption failed, storing unencrypted:', error)
    return message
  }
}

/**
 * Decrypt message data from storage
 */
async function decryptMessageData(data: string | StoredMessage): Promise<StoredMessage | null> {
  if (typeof data === 'object') {
    // Already unencrypted
    return data
  }

  if (!isEncrypted(data)) {
    // Not encrypted string - try to parse as JSON (legacy)
    try {
      return JSON.parse(data) as StoredMessage
    } catch {
      return null
    }
  }

  const masterKey = getMasterKeyFn?.()
  if (!masterKey) {
    console.log('[MessageStorage] Cannot decrypt - master key not available')
    return null
  }

  try {
    return await decryptData<StoredMessage>(data, masterKey)
  } catch (error) {
    console.error('[MessageStorage] Decryption failed:', error)
    return null
  }
}

/**
 * Store an encrypted message in IndexedDB
 */
export async function storeMessage(message: StoredMessage): Promise<void> {
  const db = await openDatabase()

  // Encrypt the message data
  const encryptedData = await encryptMessageData(message)

  // Store with index fields unencrypted for queries
  const record: StoredMessageRecord = {
    messageId: message.messageId,
    conversationId: message.conversationId,
    timestamp: message.timestamp,
    data: encryptedData,
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(record)

    request.onsuccess = () => {
      console.log(`[Message Storage] Stored message ${message.messageId}`)
      resolve()
    }

    request.onerror = () => {
      reject(new Error(`Failed to store message: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Get all messages for a specific conversation, ordered by timestamp
 */
export async function getMessages(
  conversationId: string,
  limit?: number
): Promise<StoredMessage[]> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('conversationTimestamp')

    // Query range for this conversation (all timestamps)
    const range = IDBKeyRange.bound(
      [conversationId, 0],
      [conversationId, Date.now()]
    )

    const request = index.openCursor(range, 'next')
    const messages: StoredMessage[] = []
    const pendingDecryptions: Promise<void>[] = []

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor && (!limit || messages.length < limit)) {
        const record = cursor.value as StoredMessageRecord

        // Handle both old format (direct fields) and new format (data field)
        if (record.data !== undefined) {
          // New format with data field
          pendingDecryptions.push(
            decryptMessageData(record.data).then((decrypted) => {
              if (decrypted) {
                messages.push(decrypted)
              }
            })
          )
        } else {
          // Legacy format - record is the message itself
          messages.push(record as unknown as StoredMessage)
        }
        cursor.continue()
      } else {
        // Wait for all decryptions to complete
        Promise.all(pendingDecryptions).then(() => {
          // Sort by timestamp since async decryption may have reordered
          messages.sort((a, b) => a.timestamp - b.timestamp)
          console.log(`[Message Storage] Retrieved ${messages.length} messages for conversation ${conversationId}`)
          resolve(messages)
        })
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to retrieve messages: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Get a single message by ID
 */
export async function getMessageById(messageId: string): Promise<StoredMessage | null> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(messageId)

    request.onsuccess = async () => {
      const record = request.result as StoredMessageRecord | undefined
      if (!record) {
        resolve(null)
        return
      }

      // Handle both formats
      if (record.data !== undefined) {
        const decrypted = await decryptMessageData(record.data)
        resolve(decrypted)
      } else {
        resolve(record as unknown as StoredMessage)
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to retrieve message: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Delete messages older than specified number of days
 */
export async function deleteOldMessages(daysThreshold: number = DAYS_TO_KEEP): Promise<number> {
  const db = await openDatabase()
  const cutoffTime = Date.now() - (daysThreshold * 24 * 60 * 60 * 1000)

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('timestamp')

    // Query all messages older than cutoff
    const range = IDBKeyRange.upperBound(cutoffTime)
    const request = index.openCursor(range)
    let deletedCount = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        cursor.delete()
        deletedCount++
        cursor.continue()
      } else {
        console.log(`[Message Storage] Deleted ${deletedCount} messages older than ${daysThreshold} days`)
        resolve(deletedCount)
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to delete old messages: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Delete all messages in a specific conversation
 */
export async function clearConversation(conversationId: string): Promise<number> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('conversationId')
    const request = index.openCursor(IDBKeyRange.only(conversationId))
    let deletedCount = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        cursor.delete()
        deletedCount++
        cursor.continue()
      } else {
        console.log(`[Message Storage] Cleared ${deletedCount} messages from conversation ${conversationId}`)
        resolve(deletedCount)
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to clear conversation: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Get count of messages in a conversation
 */
export async function getMessageCount(conversationId: string): Promise<number> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('conversationId')
    const request = index.count(IDBKeyRange.only(conversationId))

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(new Error(`Failed to count messages: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Cleanup old messages on app startup
 * Should be called once when the app initializes
 */
export async function cleanupOldMessages(): Promise<void> {
  try {
    const deletedCount = await deleteOldMessages(DAYS_TO_KEEP)
    if (deletedCount > 0) {
      console.log(`[Message Storage] Startup cleanup: Removed ${deletedCount} old messages`)
    }
  } catch (error) {
    console.error('[Message Storage] Failed to cleanup old messages:', error)
  }
}

/**
 * Generate a standardized conversation ID from two user IDs
 * Always returns IDs in lexicographic order for consistency
 */
export function getConversationId(userId1: string, userId2: string): string {
  return userId1 < userId2 ? `${userId1}-${userId2}` : `${userId2}-${userId1}`
}

/**
 * Mark all messages in a conversation as read
 *
 * Note: We collect items first, then update in separate transactions
 * to avoid IndexedDB transaction timeout issues with async operations
 */
export async function markConversationAsRead(conversationId: string): Promise<void> {
  const db = await openDatabase()

  // Step 1: Collect all unread messages (synchronously)
  interface UnreadItem {
    messageId: string
    record: StoredMessageRecord
  }
  const unreadItems: UnreadItem[] = []

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('conversationId')
    const request = index.openCursor(IDBKeyRange.only(conversationId))

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const record = cursor.value as StoredMessageRecord
        unreadItems.push({
          messageId: record.messageId,
          record,
        })
        cursor.continue()
      } else {
        resolve()
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to scan conversation: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })

  // Step 2: Process each item and update if needed
  let updatedCount = 0
  for (const item of unreadItems) {
    try {
      // Decrypt to check if unread (async operation outside transaction)
      let message: StoredMessage | null = null
      if (item.record.data !== undefined) {
        message = await decryptMessageData(item.record.data)
      } else {
        message = item.record as unknown as StoredMessage
      }

      if (message && !message.isSent && !message.isRead) {
        message.isRead = true

        // Re-encrypt the updated message
        const encryptedData = await encryptMessageData(message)

        // Write in a new transaction
        const writeDb = await openDatabase()
        await new Promise<void>((resolve, reject) => {
          const transaction = writeDb.transaction([STORE_NAME], 'readwrite')
          const store = transaction.objectStore(STORE_NAME)

          const request = store.put({
            messageId: message!.messageId,
            conversationId: message!.conversationId,
            timestamp: message!.timestamp,
            data: encryptedData,
          })

          request.onsuccess = () => {
            updatedCount++
            resolve()
          }

          request.onerror = () => {
            reject(new Error(`Failed to update message ${message!.messageId}`))
          }

          transaction.oncomplete = () => {
            writeDb.close()
          }
        })
      }
    } catch (error) {
      console.error(`[Message Storage] Failed to mark message as read:`, error)
    }
  }

  console.log(`[Message Storage] Marked ${updatedCount} messages as read in conversation ${conversationId}`)
}

/**
 * Get unread message count for a specific conversation
 */
export async function getUnreadCount(conversationId: string): Promise<number> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('conversationId')
    const request = index.openCursor(IDBKeyRange.only(conversationId))
    let unreadCount = 0
    const pendingDecryptions: Promise<void>[] = []

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const record = cursor.value as StoredMessageRecord

        // Handle both formats
        if (record.data !== undefined) {
          pendingDecryptions.push(
            decryptMessageData(record.data).then((message) => {
              if (message && !message.isSent && !message.isRead) {
                unreadCount++
              }
            })
          )
        } else {
          const message = record as unknown as StoredMessage
          if (!message.isSent && !message.isRead) {
            unreadCount++
          }
        }
        cursor.continue()
      } else {
        Promise.all(pendingDecryptions).then(() => {
          resolve(unreadCount)
        })
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to get unread count: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Get unread counts for all conversations
 * Returns a map of conversationId -> unread count
 */
export async function getAllUnreadCounts(): Promise<Map<string, number>> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()
    const unreadCounts = new Map<string, number>()
    const pendingDecryptions: Promise<void>[] = []

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const record = cursor.value as StoredMessageRecord

        // Handle both formats
        if (record.data !== undefined) {
          pendingDecryptions.push(
            decryptMessageData(record.data).then((message) => {
              if (message && !message.isSent && !message.isRead) {
                const current = unreadCounts.get(message.conversationId) || 0
                unreadCounts.set(message.conversationId, current + 1)
              }
            })
          )
        } else {
          const message = record as unknown as StoredMessage
          if (!message.isSent && !message.isRead) {
            const current = unreadCounts.get(message.conversationId) || 0
            unreadCounts.set(message.conversationId, current + 1)
          }
        }
        cursor.continue()
      } else {
        Promise.all(pendingDecryptions).then(() => {
          resolve(unreadCounts)
        })
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to get all unread counts: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Get unread message counts keyed by sender user ID
 * This is useful for showing unread indicators per contact
 */
export async function getUnreadCounts(): Promise<Record<string, number>> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()
    const unreadCounts: Record<string, number> = {}
    const pendingDecryptions: Promise<void>[] = []

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const record = cursor.value as StoredMessageRecord

        // Handle both formats
        if (record.data !== undefined) {
          pendingDecryptions.push(
            decryptMessageData(record.data).then((message) => {
              if (message && !message.isSent && !message.isRead) {
                const senderId = message.senderId
                unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1
              }
            })
          )
        } else {
          const message = record as unknown as StoredMessage
          if (!message.isSent && !message.isRead) {
            const senderId = message.senderId
            unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1
          }
        }
        cursor.continue()
      } else {
        Promise.all(pendingDecryptions).then(() => {
          resolve(unreadCounts)
        })
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to get unread counts: ${request.error}`))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

/**
 * Migrate unencrypted messages to encrypted format
 * Should be called once master key is available
 *
 * Note: We collect items first, then migrate in separate transactions
 * to avoid IndexedDB transaction timeout issues with async operations
 */
export async function migrateMessagesToEncrypted(): Promise<number> {
  const masterKey = getMasterKeyFn?.()
  if (!masterKey) {
    console.log('[MessageStorage] Cannot migrate - master key not available')
    return 0
  }

  const db = await openDatabase()

  // Step 1: Collect all items that need migration (synchronously)
  interface MigrationItem {
    message: StoredMessage
  }
  const itemsToMigrate: MigrationItem[] = []

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const record = cursor.value

        // Check if needs migration
        const needsMigration =
          // Legacy format without data field
          (record.data === undefined && record.senderId !== undefined) ||
          // New format but data is not encrypted
          (record.data !== undefined && !isEncrypted(record.data))

        if (needsMigration) {
          // Extract the message data for migration
          const message: StoredMessage = record.data !== undefined
            ? (typeof record.data === 'object' ? record.data : JSON.parse(record.data))
            : record

          itemsToMigrate.push({ message })
        }

        cursor.continue()
      } else {
        resolve()
      }
    }

    request.onerror = () => {
      reject(new Error('Message migration scan failed'))
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })

  if (itemsToMigrate.length === 0) {
    console.log('[MessageStorage] No messages need migration')
    return 0
  }

  console.log(`[MessageStorage] Found ${itemsToMigrate.length} messages to migrate`)

  // Step 2: Migrate each item in its own transaction
  let migratedCount = 0
  for (const item of itemsToMigrate) {
    try {
      // Encrypt the data (async operation outside of transaction)
      const encrypted = await encryptData(item.message, masterKey)

      // Write in a new transaction
      const writeDb = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = writeDb.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        const request = store.put({
          messageId: item.message.messageId,
          conversationId: item.message.conversationId,
          timestamp: item.message.timestamp,
          data: encrypted,
        })

        request.onsuccess = () => {
          migratedCount++
          resolve()
        }

        request.onerror = () => {
          reject(new Error(`Failed to update message ${item.message.messageId}`))
        }

        transaction.oncomplete = () => {
          writeDb.close()
        }
      })
    } catch (error) {
      console.error(`[MessageStorage] Failed to migrate message ${item.message.messageId}:`, error)
    }
  }

  console.log(`[MessageStorage] Migration complete: ${migratedCount} messages migrated`)
  return migratedCount
}

/**
 * Re-encrypt all messages with a new master key
 * Used during key rotation to ensure all data uses the new key
 *
 * @param oldKey - The current master key to decrypt data
 * @param newKey - The new master key to encrypt data
 * @param onProgress - Optional callback for progress updates (done, total)
 * @returns Number of messages re-encrypted
 */
export async function reEncryptAllMessages(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const db = await openDatabase()

  // Step 1: Count total messages for progress tracking
  const totalCount = await new Promise<number>((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.count()

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Failed to count messages'))

    transaction.oncomplete = () => db.close()
  })

  if (totalCount === 0) {
    console.log('[MessageStorage] No messages to re-encrypt')
    return 0
  }

  console.log(`[MessageStorage] Re-encrypting ${totalCount} messages...`)
  onProgress?.(0, totalCount)

  // Step 2: Collect all messages (read-only pass)
  const readDb = await openDatabase()
  const records: StoredMessageRecord[] = []

  await new Promise<void>((resolve, reject) => {
    const transaction = readDb.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.openCursor()

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        records.push(cursor.value as StoredMessageRecord)
        cursor.continue()
      } else {
        resolve()
      }
    }

    request.onerror = () => reject(new Error('Failed to read messages'))
    transaction.oncomplete = () => readDb.close()
  })

  // Step 3: Re-encrypt each message with the new key
  let reEncryptedCount = 0

  for (let i = 0; i < records.length; i++) {
    const record = records[i]

    try {
      // Decrypt with old key
      let message: StoredMessage | null = null

      if (record.data !== undefined) {
        if (typeof record.data === 'string' && isEncrypted(record.data)) {
          // Encrypted format - decrypt with old key
          message = await decryptData<StoredMessage>(record.data, oldKey)
        } else if (typeof record.data === 'object') {
          // Unencrypted object
          message = record.data as StoredMessage
        } else {
          // Try to parse as JSON
          try {
            message = JSON.parse(record.data) as StoredMessage
          } catch {
            console.warn(`[MessageStorage] Could not parse message ${record.messageId}`)
            continue
          }
        }
      } else {
        // Legacy format - record is the message itself
        message = record as unknown as StoredMessage
      }

      if (!message) {
        console.warn(`[MessageStorage] Could not decrypt message ${record.messageId}`)
        continue
      }

      // Re-encrypt with new key
      const newEncrypted = await encryptData(message, newKey)

      // Write re-encrypted data
      const writeDb = await openDatabase()
      await new Promise<void>((resolve, reject) => {
        const transaction = writeDb.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        const request = store.put({
          messageId: message!.messageId,
          conversationId: message!.conversationId,
          timestamp: message!.timestamp,
          data: newEncrypted,
        })

        request.onsuccess = () => {
          reEncryptedCount++
          resolve()
        }

        request.onerror = () => {
          reject(new Error(`Failed to re-encrypt message ${message!.messageId}`))
        }

        transaction.oncomplete = () => writeDb.close()
      })

      // Report progress
      onProgress?.(i + 1, totalCount)
    } catch (error) {
      console.error(`[MessageStorage] Failed to re-encrypt message ${record.messageId}:`, error)
      // Continue with other messages even if one fails
    }
  }

  console.log(`[MessageStorage] Re-encryption complete: ${reEncryptedCount}/${totalCount} messages`)
  return reEncryptedCount
}
