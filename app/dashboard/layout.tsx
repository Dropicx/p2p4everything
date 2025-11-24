'use client'

import { useEffect } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { useWebRTC } from '@/hooks/useWebRTC'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { onNotification, isReady } = useWebRTC()

  // Run 30-day message cleanup on dashboard load
  useEffect(() => {
    async function runCleanup() {
      try {
        const { cleanupOldMessages } = await import('@/lib/crypto/message-storage')
        await cleanupOldMessages()
      } catch (error) {
        console.error('[Dashboard] Failed to run message cleanup:', error)
      }
    }

    runCleanup()
  }, [])

  // Listen for message notifications and poll queue
  useEffect(() => {
    if (!isReady) return

    console.log('[Dashboard] Setting up message notification listener')

    const unsubscribe = onNotification(async (senderId) => {
      console.log('[Dashboard] Received message notification from:', senderId)

      try {
        // Poll the message queue
        const response = await fetch('/api/messages/queue')
        if (!response.ok) {
          console.error('[Dashboard] Failed to fetch queued messages:', response.status)
          return
        }

        const data = await response.json()
        const queuedMessages = data.messages || []

        console.log(`[Dashboard] Received ${queuedMessages.length} queued messages`)

        if (queuedMessages.length === 0) return

        // Get current user ID and key pair for decryption
        const deviceId = localStorage.getItem('p2p4everything-device-id')
        if (!deviceId) {
          console.warn('[Dashboard] No device ID found')
          return
        }

        const { getKeyPair } = await import('@/lib/crypto/storage')
        const storedKeyPair = await getKeyPair(deviceId)
        if (!storedKeyPair) {
          console.warn('[Dashboard] No stored key pair found')
          return
        }

        const { importKeyPair } = await import('@/lib/crypto/keys')
        const keyPair = await importKeyPair(storedKeyPair)

        // Get current user's database ID
        const userResponse = await fetch('/api/users/me')
        if (!userResponse.ok) return

        const currentUser = await userResponse.json()
        const currentUserId = currentUser.id

        // Store messages in IndexedDB
        const { storeMessage, getConversationId } = await import('@/lib/crypto/message-storage')

        for (const msg of queuedMessages) {
          try {
            const conversationId = getConversationId(currentUserId, msg.senderId)

            await storeMessage({
              messageId: msg.messageId,
              conversationId,
              senderId: msg.senderId,
              receiverId: currentUserId,
              encryptedContent: msg.encryptedContent,
              timestamp: msg.timestamp,
              isSent: false,
              metadataId: msg.id,
            })

            console.log('[Dashboard] Stored queued message in IndexedDB:', msg.messageId)
          } catch (error) {
            console.error('[Dashboard] Failed to store queued message:', msg.messageId, error)
          }
        }

        // TODO: Show notification to user (optional)
        console.log(`[Dashboard] Stored ${queuedMessages.length} new messages`)
      } catch (error) {
        console.error('[Dashboard] Error processing message notification:', error)
      }
    })

    return () => {
      console.log('[Dashboard] Cleaning up message notification listener')
      unsubscribe()
    }
  }, [isReady, onNotification])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}

