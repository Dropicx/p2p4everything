'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/layout/navbar'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useNotifications } from '@/hooks/useNotifications'
import { useToast, ToastContainer } from '@/components/ui/toast'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { onNotification, isReady, client } = useWebRTC()
  const { isSupported, permission, requestPermission, showNotification } = useNotifications()
  const { toasts, showToast, removeToast } = useToast()

  // Request notification permission on dashboard load
  useEffect(() => {
    console.log('[Dashboard] Notification check - isSupported:', isSupported, 'permission:', permission)
    if (isSupported && permission === 'default') {
      console.log('[Dashboard] Requesting notification permission...')
      requestPermission().then((result) => {
        if (result === 'granted') {
          console.log('[Dashboard] Notification permission granted ✓')
        } else {
          console.log('[Dashboard] Notification permission denied or dismissed:', result)
        }
      })
    } else if (permission === 'granted') {
      console.log('[Dashboard] Notification permission already granted ✓')
    } else if (permission === 'denied') {
      console.log('[Dashboard] Notification permission was previously denied ✗')
    }
  }, [isSupported, permission, requestPermission])

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
    if (!isReady || !client) {
      console.log('[Dashboard] Waiting for WebRTC client to be ready...')
      return
    }

    console.log('[Dashboard] Setting up message notification listener')

    const unsubscribe = onNotification(async (senderId) => {
      console.log('[Dashboard] Received message notification from:', senderId)

      try {
        // Fetch sender info for notification
        let senderName = 'Someone'
        try {
          const connectionsResponse = await fetch('/api/connections')
          if (connectionsResponse.ok) {
            const connectionsData = await connectionsResponse.json()
            const connection = connectionsData.connections.find(
              (c: any) => c.otherUser.id === senderId && c.status === 'accepted'
            )
            if (connection) {
              senderName = connection.otherUser.displayName ||
                          connection.otherUser.username ||
                          connection.otherUser.email ||
                          'Someone'
            }
          }
        } catch (error) {
          console.warn('[Dashboard] Failed to fetch sender info:', error)
        }

        // Show in-app toast notification
        showToast({
          title: `New message from ${senderName}`,
          message: 'Click to view',
          type: 'info',
          duration: 5000,
          onClick: () => {
            router.push(`/dashboard/messages/${senderId}`)
          },
        })

        // Show browser notification
        console.log('[Dashboard] Attempting to show browser notification for:', senderName)
        showNotification({
          title: `New message from ${senderName}`,
          body: 'Click to view message',
          tag: `message-${senderId}`,
          data: { senderId },
          onClick: () => {
            console.log('[Dashboard] Notification clicked, navigating to chat')
            router.push(`/dashboard/messages/${senderId}`)
          },
        })
        console.log('[Dashboard] Browser notification triggered')

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
              isRead: false, // Mark as unread
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
  }, [isReady, client, onNotification, showNotification, router])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <Navbar />

      {/* Notification Debug Panel */}
      {isSupported && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Browser Notifications:
                </span>
                <span className={`text-sm px-2 py-1 rounded ${
                  permission === 'granted'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                    : permission === 'denied'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                }`}>
                  {permission === 'granted' ? '✓ Enabled' : permission === 'denied' ? '✗ Blocked' : '? Not Set'}
                </span>
              </div>
              <div className="flex gap-2">
                {permission !== 'granted' && (
                  <button
                    onClick={requestPermission}
                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    Enable Notifications
                  </button>
                )}
                {permission === 'granted' && (
                  <button
                    onClick={() => {
                      showNotification({
                        title: 'Test Notification',
                        body: 'This is a test notification from p2p4everything',
                        onClick: () => {
                          console.log('[Dashboard] Test notification clicked')
                        },
                      })
                    }}
                    className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                  >
                    Test Notification
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}

