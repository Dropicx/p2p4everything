'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams, useRouter } from 'next/navigation'
import { MessageList } from '@/components/messages/message-list'
import { MessageInput } from '@/components/messages/message-input'
import { useWebRTC } from '@/hooks/useWebRTC'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { importPublicKey, importKeyPair } from '@/lib/crypto/keys'
import { getKeyPair as getStoredKeyPair } from '@/lib/crypto/storage'

interface Message {
  id: string
  message: string
  senderId: string
  receiverId: string
  timestamp: Date
  senderName?: string
}

interface User {
  id: string
  displayName: string | null
  username: string | null
  email: string | null
  avatarUrl: string | null
}

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const { userId: clerkUserId } = useAuth()
  const userId = params.userId as string
  const [messages, setMessages] = useState<Message[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const { client, isReady, sendMessage, onMessage, connectToPeer } = useWebRTC()

  useEffect(() => {
    if (!userId) return

    async function loadChat() {
      try {
        // Get current user's database ID
        const currentUserResponse = await fetch('/api/users/me')
        if (currentUserResponse.ok) {
          const currentUser = await currentUserResponse.json()
          setCurrentUserId(currentUser.id)
        }

        // Load user info
        const connectionsResponse = await fetch('/api/connections')
        if (connectionsResponse.ok) {
          const connectionsData = await connectionsResponse.json()
          const connection = connectionsData.connections.find(
            (c: any) => c.otherUser.id === userId && c.status === 'accepted'
          )

          if (!connection) {
            router.push('/dashboard/connections')
            return
          }

          setUser(connection.otherUser)
        }

        // Load messages
        const messagesResponse = await fetch(`/api/messages?with=${userId}`)
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json()
          const formattedMessages = messagesData.messages.map((msg: any) => ({
            id: msg.id,
            message: '', // Will be decrypted
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            timestamp: new Date(msg.timestamp),
            senderName:
              msg.sender.displayName ||
              msg.sender.username ||
              msg.sender.email ||
              'Unknown',
          }))

          // Decrypt messages
          const deviceId = localStorage.getItem('p2p4everything-device-id')
          if (deviceId) {
            const storedKeyPair = await getStoredKeyPair(deviceId)
            if (storedKeyPair) {
              const keyPair = await importKeyPair(storedKeyPair)

              // Decrypt each message (for now, messages are stored as plaintext in metadata)
              // In production, you'd decrypt the actual encrypted content
              for (const msg of formattedMessages) {
                // TODO: Decrypt message content from encryptedContentHash or separate storage
                msg.message = '[Encrypted message]' // Placeholder
              }
            }
          }

          setMessages(formattedMessages)
        }
      } catch (error) {
        console.error('Error loading chat:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadChat()
  }, [clerkUserId, userId, router])

  // Set up message handler
  useEffect(() => {
    if (!isReady || !userId || !currentUserId) return

    const unsubscribe = onMessage(userId, async (encryptedMessage) => {
      try {
        // Decrypt message
        const deviceId = localStorage.getItem('p2p4everything-device-id')
        if (!deviceId) return

        const storedKeyPair = await getStoredKeyPair(deviceId)
        if (!storedKeyPair) return

        const keyPair = await importKeyPair(storedKeyPair)

        const message = await decryptMessage(
          encryptedMessage,
          keyPair.privateKey
        )

        // Add to messages
        setMessages((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            message,
            senderId: userId,
            receiverId: currentUserId,
            timestamp: new Date(),
            senderName: user?.displayName || user?.username || 'Unknown',
          },
        ])
      } catch (error) {
        console.error('Error decrypting message:', error)
      }
    })

    return unsubscribe
  }, [isReady, userId, onMessage, currentUserId, user])

  // Connect to peer when ready
  useEffect(() => {
    if (isReady && userId && client) {
      // Use user ID as room ID for P2P connection
      const roomId = `user-${userId}`
      if (client) {
        client.joinRoom(roomId)
      }
      
      // Also try direct connection
      connectToPeer(userId, undefined, roomId).catch((error) => {
        console.error('Error connecting to peer:', error)
      })
    }
  }, [isReady, userId, client, connectToPeer])

  const handleSend = useCallback(
    async (messageText: string) => {
      if (!userId || !currentUserId || isSending) return

      setIsSending(true)

      try {
        // Get recipient's public key
        const devicesResponse = await fetch(`/api/users/${userId}/devices`)
        if (!devicesResponse.ok) {
          throw new Error('Failed to get recipient devices')
        }

        const devices = await devicesResponse.json()

        if (devices.length === 0 || !devices[0].publicKey) {
          throw new Error('Recipient has no public key')
        }

        // Import recipient's public key
        const recipientPublicKey = await importPublicKey(devices[0].publicKey)

        // Encrypt message
        const encryptedMessage = await encryptMessage(
          messageText,
          recipientPublicKey
        )

        // Send via WebRTC
        const success = sendMessage(userId, encryptedMessage)

        if (success) {
          // Create message metadata
          const messageResponse = await fetch('/api/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              receiverId: userId,
              messageType: 'text',
              encryptedContentHash: '', // TODO: Calculate hash of encrypted content
            }),
          })

          if (messageResponse.ok) {
            const newMessage = await messageResponse.json()

            // Add to local messages
            setMessages((prev) => [
              ...prev,
              {
                id: newMessage.id,
                message: messageText,
                senderId: currentUserId,
                receiverId: userId,
                timestamp: new Date(newMessage.timestamp),
                senderName: 'You',
              },
            ])
          }
      } else {
        throw new Error('Failed to send message via WebRTC')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Make sure you are connected to the peer.'
      )
    } finally {
      setIsSending(false)
    }
  },
    [userId, currentUserId, sendMessage, isSending]
  )

  if (isLoading) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 dark:text-gray-400">Loading chat...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-600 dark:text-gray-400">User not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/messages')}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            ← Back
          </button>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName || 'User'}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
              <span className="text-gray-600 dark:text-gray-400">
                {(user.displayName || user.username || user.email || 'U')[0].toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {user.displayName || user.username || user.email || 'Unknown User'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {isReady ? 'Connected' : 'Connecting...'}
            </p>
          </div>
        </div>
      </div>

      <MessageList
        messages={messages}
        currentUserId={currentUserId || ''}
      />

      <MessageInput onSend={handleSend} disabled={!isReady || isSending} />
    </div>
  )
}

