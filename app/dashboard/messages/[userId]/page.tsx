'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams, useRouter } from 'next/navigation'
import { MessageList } from '@/components/messages/message-list'
import { MessageInput } from '@/components/messages/message-input'
import { DeviceRegistration } from '@/components/dashboard/device-registration'
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
  const [sendError, setSendError] = useState<string | null>(null)
  const [recipientDeviceStatus, setRecipientDeviceStatus] = useState<{
    hasDevices: boolean
    hasPublicKey: boolean
  } | null>(null)
  const [peerConnectionState, setPeerConnectionState] = useState<string | null>(null)
  const [dataChannelState, setDataChannelState] = useState<string | null>(null)
  const { client, isReady, sendMessage, onMessage, connectToPeer } = useWebRTC()

  // Create a normalized room ID that's the same for both users
  const getRoomId = useCallback((userId1: string, userId2: string): string => {
    // Sort user IDs to ensure consistent room ID regardless of who opens chat
    const sortedIds = [userId1, userId2].sort()
    return `chat-${sortedIds[0]}-${sortedIds[1]}`
  }, [])

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

        // Check recipient device status
        try {
          console.log(`[Chat Page] Checking recipient device status for userId: ${userId}`)
          const devicesCheckResponse = await fetch(`/api/users/${userId}/devices`)
          console.log(`[Chat Page] Device status check response: ${devicesCheckResponse.status}`)
          
          if (devicesCheckResponse.ok) {
            const recipientDevices = await devicesCheckResponse.json()
            console.log(`[Chat Page] Found ${recipientDevices.length} recipient devices`)
            
            const hasDevices = recipientDevices.length > 0
            const hasPublicKey = recipientDevices.some((d: any) => {
              const hasKey = d.publicKey && (typeof d.publicKey === 'string' ? d.publicKey.trim() : true)
              console.log(`[Chat Page] Device ${d.id} (${d.deviceName}): hasPublicKey=${hasKey}`)
              return hasKey
            })
            
            console.log(`[Chat Page] Device status: hasDevices=${hasDevices}, hasPublicKey=${hasPublicKey}`)
            setRecipientDeviceStatus({ hasDevices, hasPublicKey })
          } else {
            const errorData = await devicesCheckResponse.json().catch(() => ({}))
            console.error(`[Chat Page] Failed to check recipient devices:`, errorData)
            // If it's a connection error, set status accordingly
            if (devicesCheckResponse.status === 403) {
              setRecipientDeviceStatus({ hasDevices: false, hasPublicKey: false })
            }
          }
        } catch (error) {
          console.error('[Chat Page] Error checking recipient device status:', error)
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

  // Connect to peer when ready and monitor connection state
  useEffect(() => {
    console.log('[Chat Page] Room join useEffect triggered:', {
      isReady,
      hasUserId: !!userId,
      hasCurrentUserId: !!currentUserId,
      hasClient: !!client,
      allConditionsMet: !!(isReady && userId && currentUserId && client)
    })

    if (isReady && userId && currentUserId && client) {
      // Use normalized room ID so both users join the same room
      const roomId = getRoomId(currentUserId, userId)
      console.log(`[Chat Page] Joining room: ${roomId}`)

      // Determine who initiates the connection using a tiebreaker
      // The peer with the lexicographically larger user ID creates the offer
      const shouldInitiate = currentUserId > userId
      console.log(`[Chat Page] Connection role: ${shouldInitiate ? 'INITIATOR' : 'RESPONDER'} (currentUserId: ${currentUserId}, userId: ${userId})`)

      // Set up room-joined handler to wait for confirmation before connecting
      const unsubscribeRoomJoined = client.signaling?.onMessage('room-joined', (message) => {
        if (message.type === 'room-joined' && message.roomId === roomId) {
          console.log('[Chat Page] Room joined confirmed')
          console.log('[Chat Page] Peers in room:', message.peers?.length || 0)

          if (message.peers && message.peers.length > 0) {
            if (shouldInitiate) {
              console.log('[Chat Page] Recipient is online, initiating connection as INITIATOR...')
              connectToPeer(userId, undefined, roomId).catch((error) => {
                console.error('[Chat Page] Error connecting to peer:', error)
              })
            } else {
              console.log('[Chat Page] Recipient is online, waiting for offer as RESPONDER...')
            }
          } else {
            console.warn('[Chat Page] Recipient is not online. Waiting for them to join...')
          }
        }
      })

      // Listen for peer-joined events (when recipient comes online)
      const unsubscribePeerJoined = client.signaling?.onMessage('peer-joined', (message) => {
        if (message.type === 'peer-joined' && message.roomId === roomId && message.userId === userId) {
          if (shouldInitiate) {
            console.log('[Chat Page] Recipient just came online, initiating connection as INITIATOR...')
            connectToPeer(userId, undefined, roomId).catch((error) => {
              console.error('[Chat Page] Error connecting to peer:', error)
            })
          } else {
            console.log('[Chat Page] Recipient just came online, waiting for offer as RESPONDER...')
          }
        }
      })

      // Join room - connection will happen in room-joined handler
      client.joinRoom(roomId)

      // Monitor connection state
      const checkInterval = setInterval(() => {
        if (client) {
          const peerState = client.getPeerConnectionState(userId)
          const channelState = client.getDataChannelState(userId)
          setPeerConnectionState(peerState || null)
          setDataChannelState(channelState || null)

          // Log state for debugging
          if (peerState || channelState) {
            console.log(`[Chat Page] Connection state - Peer: ${peerState}, Data Channel: ${channelState}`)
          }
        }
      }, 1000) // Check every second

      return () => {
        // Clean up handlers and interval
        unsubscribeRoomJoined?.()
        unsubscribePeerJoined?.()
        clearInterval(checkInterval)
        // Leave room when unmounting
        client.leaveRoom(roomId)
        console.log(`[Chat Page] Left room: ${roomId}`)
      }
    }
  }, [isReady, userId, currentUserId, client, connectToPeer, getRoomId])

  const handleSend = useCallback(
    async (messageText: string) => {
      if (!userId || !currentUserId || isSending) return

      setIsSending(true)
      setSendError(null)

      try {
        // Get recipient's public key
        console.log(`[Send Message] Fetching devices for recipient userId: ${userId}`)
        const devicesResponse = await fetch(`/api/users/${userId}/devices`)
        
        console.log(`[Send Message] Devices API response status: ${devicesResponse.status}`)
        
        if (!devicesResponse.ok) {
          const errorData = await devicesResponse.json().catch(() => ({}))
          console.error('[Send Message] Devices API error:', errorData)
          throw new Error(errorData.error || 'Failed to get recipient devices')
        }

        const devices = await devicesResponse.json()
        console.log(`[Send Message] Received ${devices.length} devices:`, devices)
        
        // Log each device's public key status
        devices.forEach((device: any, index: number) => {
          console.log(
            `[Send Message] Device ${index + 1}: ${device.deviceName} (${device.deviceType}), ` +
            `hasPublicKey: ${!!device.publicKey}, ` +
            `publicKeyType: ${typeof device.publicKey}, ` +
            `publicKeyLength: ${device.publicKey?.length || 0}, ` +
            `publicKeyPreview: ${device.publicKey ? device.publicKey.substring(0, 50) + '...' : 'null'}`
          )
        })

        // Find a device with a valid public key
        let recipientPublicKey: CryptoKey | null = null
        let deviceWithKey = null

        for (const device of devices) {
          if (!device.publicKey) {
            console.log(`[Send Message] Device ${device.id} (${device.deviceName}) has no publicKey field`)
            continue
          }

          try {
            // Handle both string and object formats
            let publicKeyString: string
            
            if (typeof device.publicKey === 'string') {
              // It's already a string, check if it's valid JSON
              const trimmed = device.publicKey.trim()
              if (!trimmed) {
                console.log(`[Send Message] Device ${device.id} has empty publicKey string`)
                continue
              }
              
              try {
                // Try to parse it to verify it's valid JSON
                const parsed = JSON.parse(trimmed)
                if (parsed && parsed.kty && parsed.n) {
                  // Valid JWK format, use the string
                  publicKeyString = trimmed
                } else {
                  console.warn(`[Send Message] Device ${device.id} publicKey is not valid JWK format`)
                  continue
                }
              } catch (parseError) {
                console.warn(`[Send Message] Device ${device.id} publicKey is not valid JSON:`, parseError)
                continue
              }
            } else if (typeof device.publicKey === 'object') {
              // It's already an object, stringify it
              if (device.publicKey.kty && device.publicKey.n) {
                publicKeyString = JSON.stringify(device.publicKey)
              } else {
                console.warn(`[Send Message] Device ${device.id} publicKey object is not valid JWK format`)
                continue
              }
            } else {
              console.warn(`[Send Message] Device ${device.id} publicKey has unexpected type: ${typeof device.publicKey}`)
              continue
            }

            // Import the public key
            console.log(`[Send Message] Attempting to import public key from device ${device.id}`)
            recipientPublicKey = await importPublicKey(publicKeyString)
            deviceWithKey = device
            console.log(`[Send Message] Successfully imported public key from device ${device.id} (${device.deviceName})`)
            break
          } catch (importError) {
            console.error(`[Send Message] Failed to import public key from device ${device.id}:`, importError)
            continue
          }
        }

        if (!recipientPublicKey || !deviceWithKey) {
          const deviceCount = devices.length
          const hasDevices = deviceCount > 0
          const hasDevicesWithoutKeys = devices.some((d: any) => !d.publicKey || !d.publicKey.trim())
          
          let errorMessage = 'Cannot send encrypted message. '
          if (!hasDevices) {
            errorMessage += 'The recipient has not registered any devices yet. '
          } else if (hasDevicesWithoutKeys) {
            errorMessage += 'The recipient\'s devices do not have encryption keys registered. '
          } else {
            errorMessage += 'Could not find a valid encryption key for the recipient. '
          }
          errorMessage += 'Ask them to visit their dashboard to register their device with encryption keys.'
          
          throw new Error(errorMessage)
        }

        // Check if WebRTC connection is ready
        if (!isReady || !client) {
          throw new Error(
            'WebRTC connection is not ready yet. Please wait a moment and try again.'
          )
        }

        // Check if peer connection is established
        const peerConnection = client.getPeerConnection(userId)
        if (!peerConnection) {
          throw new Error(
            'Peer connection not established yet. The connection is being set up. Please wait a moment and try again.'
          )
        }

        const connectionState = peerConnection.getConnectionState()
        if (connectionState !== 'connected' && connectionState !== 'connecting') {
          throw new Error(
            `Peer connection is not ready (state: ${connectionState}). ` +
            `Please wait for the connection to be established and try again.`
          )
        }

        // Check if data channel is open
        const isDataChannelOpen = client.isDataChannelOpen(userId)
        if (!isDataChannelOpen) {
          const channelState = client.getDataChannelState(userId)
          throw new Error(
            `Data channel is not open yet (state: ${channelState || 'not found'}). ` +
            `The connection is still being established. Please wait a moment and try again.`
          )
        }

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
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to send message. Make sure you are connected to the peer.'
        setSendError(errorMessage)
        // Also show alert for immediate feedback
        setTimeout(() => {
          alert(errorMessage)
        }, 100)
      } finally {
        setIsSending(false)
      }
    },
    [userId, currentUserId, sendMessage, isSending, client, isReady]
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
      <DeviceRegistration />
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

      {/* Connection status indicator */}
      {isReady && peerConnectionState && (
        <div className={`border-t border-gray-200 dark:border-gray-700 p-2 ${
          peerConnectionState === 'connected' && dataChannelState === 'open'
            ? 'bg-green-50 dark:bg-green-900/20'
            : 'bg-yellow-50 dark:bg-yellow-900/20'
        }`}>
          <p className="text-xs text-center">
            {peerConnectionState === 'connected' && dataChannelState === 'open' ? (
              <span className="text-green-600 dark:text-green-400">
                ✓ Connected and ready to send messages
              </span>
            ) : (
              <span className="text-yellow-600 dark:text-yellow-400">
                ⏳ Connecting... (Peer: {peerConnectionState}, Channel: {dataChannelState || 'not found'})
              </span>
            )}
          </p>
        </div>
      )}

      {recipientDeviceStatus && !recipientDeviceStatus.hasPublicKey && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-yellow-50 dark:bg-yellow-900/20">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                {recipientDeviceStatus.hasDevices
                  ? 'Recipient device not ready for encryption'
                  : 'Recipient has not registered a device yet'}
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {recipientDeviceStatus.hasDevices
                  ? 'The recipient\'s device is registered but doesn\'t have encryption keys. Ask them to visit their dashboard to complete device setup.'
                  : 'The recipient needs to visit their dashboard to register their device with encryption keys before you can send encrypted messages.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <MessageList
        messages={messages}
        currentUserId={currentUserId || ''}
      />

      {sendError && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Cannot send encrypted message
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {sendError}
              </p>
              <button
                onClick={async () => {
                  setSendError(null)
                  // Try to refresh and retry
                  const devicesResponse = await fetch(`/api/users/${userId}/devices`)
                  if (devicesResponse.ok) {
                    const devices = await devicesResponse.json()
                    console.log('Refreshed recipient devices:', devices)
                  }
                }}
                className="mt-2 text-xs text-red-700 dark:text-red-300 hover:underline"
              >
                Refresh & Retry
              </button>
            </div>
            <button
              onClick={() => setSendError(null)}
              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <MessageInput onSend={handleSend} disabled={!isReady || isSending} />
    </div>
  )
}

