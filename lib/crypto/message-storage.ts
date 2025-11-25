/**
 * Client-side encrypted message storage using IndexedDB
 * Provides persistent storage for encrypted messages with 30-day auto-cleanup
 */

const DB_NAME = 'p2p4everything-messages'
const DB_VERSION = 2 // Incremented for isRead field
const STORE_NAME = 'messages'
const DAYS_TO_KEEP = 30

export interface StoredMessage {
  messageId: string // Primary key
  conversationId: string // Indexed for efficient queries
  senderId: string
  receiverId: string
  encryptedContent: string // Encrypted message: sent (encrypted with sender's public key) | received (encrypted with recipient's public key)
  timestamp: number // Unix timestamp in milliseconds
  isSent: boolean // true if sent by this user, false if received
  isRead?: boolean // true if message has been read (default: false for received, true for sent)
  metadataId?: string // Optional link to server metadata
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
 * Store an encrypted message in IndexedDB
 */
export async function storeMessage(message: StoredMessage): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(message)

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

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor && (!limit || messages.length < limit)) {
        messages.push(cursor.value)
        cursor.continue()
      } else {
        console.log(`[Message Storage] Retrieved ${messages.length} messages for conversation ${conversationId}`)
        resolve(messages)
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

    request.onsuccess = () => {
      resolve(request.result || null)
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
 */
export async function markConversationAsRead(conversationId: string): Promise<void> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('conversationId')
    const request = index.openCursor(IDBKeyRange.only(conversationId))

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const message = cursor.value as StoredMessage
        // Only update received messages that aren't already read
        if (!message.isSent && !message.isRead) {
          message.isRead = true
          cursor.update(message)
        }
        cursor.continue()
      }
    }

    request.onerror = () => {
      reject(new Error(`Failed to mark conversation as read: ${request.error}`))
    }

    transaction.oncomplete = () => {
      console.log(`[Message Storage] Marked conversation ${conversationId} as read`)
      db.close()
      resolve()
    }
  })
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

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const message = cursor.value as StoredMessage
        // Count received messages that haven't been read
        if (!message.isSent && !message.isRead) {
          unreadCount++
        }
        cursor.continue()
      } else {
        resolve(unreadCount)
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

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const message = cursor.value as StoredMessage
        // Count received messages that haven't been read
        if (!message.isSent && !message.isRead) {
          const current = unreadCounts.get(message.conversationId) || 0
          unreadCounts.set(message.conversationId, current + 1)
        }
        cursor.continue()
      } else {
        resolve(unreadCounts)
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

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result

      if (cursor) {
        const message = cursor.value as StoredMessage
        // Count received messages that haven't been read, keyed by sender
        if (!message.isSent && !message.isRead) {
          const senderId = message.senderId
          unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1
        }
        cursor.continue()
      } else {
        resolve(unreadCounts)
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
