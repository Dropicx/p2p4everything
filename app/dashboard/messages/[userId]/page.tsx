'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useParams, useRouter } from 'next/navigation'
import { MessageList } from '@/components/messages/message-list'
import { MessageInput } from '@/components/messages/message-input'
import { DeviceRegistration } from '@/components/dashboard/device-registration'
import { useWebRTC } from '@/hooks/useWebRTC'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { importPublicKey, importKeyPair } from '@/lib/crypto/keys'
import { getKeyPair as getStoredKeyPair } from '@/lib/crypto/storage'
import { storeMessage, getConversationId, clearConversation } from '@/lib/crypto/message-storage'

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
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const optionsMenuRef = useRef<HTMLDivElement>(null)
  const { client, isReady, sendMessage, onMessage, connectToPeer } = useWebRTC()

  // Create a normalized room ID that's the same for both users
  const getRoomId = useCallback((userId1: string, userId2: string): string => {
    // Sort user IDs to ensure consistent room ID regardless of who opens chat
    const sortedIds = [userId1, userId2].sort()
    return `chat-${sortedIds[0]}-${sortedIds[1]}`
  }, [])

  // Close options menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(false)
      }
    }

    if (showOptionsMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showOptionsMenu])

  useEffect(() => {
    if (!userId) return

    async function loadChat() {
      try {
        // Get current user's database ID
        const currentUserResponse = await fetch('/api/users/me')
        let currentUserDbId: string | null = null

        if (currentUserResponse.ok) {
          const currentUser = await currentUserResponse.json()
          currentUserDbId = currentUser.id
          setCurrentUserId(currentUserDbId)
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

        // Load messages from IndexedDB
        if (!currentUserDbId || !userId) {
          console.warn('[Chat Page] Cannot load messages: missing currentUserDbId or userId')
          return
        }

        const conversationId = getConversationId(currentUserDbId, userId)
        console.log('[Chat Page] Loading messages from IndexedDB for conversation:', conversationId)

        const { getMessages } = await import('@/lib/crypto/message-storage')
        const storedMessages = await getMessages(conversationId)
        console.log('[Chat Page] Found', storedMessages.length, 'messages in IndexedDB')

        // Get private key for decryption
        const deviceId = localStorage.getItem('p2p4everything-device-id')
        if (!deviceId) {
          console.warn('[Chat Page] No device ID found')
          setMessages([])
          return
        }

        const storedKeyPair = await getStoredKeyPair(deviceId)
        if (!storedKeyPair) {
          console.warn('[Chat Page] No stored key pair found')
          setMessages([])
          return
        }

        const keyPair = await importKeyPair(storedKeyPair)

        // Decrypt all messages (both sent and received) with private key
        const decryptedMessages = await Promise.all(
          storedMessages.map(async (msg) => {
            try {
              let messageText: string

              // Both sent and received messages are encrypted and need decryption
              // Sent: encrypted with sender's own public key
              // Received: encrypted with recipient's public key
              messageText = await decryptMessage(
                msg.encryptedContent,
                keyPair.privateKey
              )

              if (msg.isSent) {
                console.log('[Chat Page] Decrypted sent message:', msg.messageId)
              } else {
                console.log('[Chat Page] Decrypted received message:', msg.messageId)
              }

              return {
                id: msg.messageId,
                message: messageText,
                senderId: msg.senderId,
                receiverId: msg.receiverId,
                timestamp: new Date(msg.timestamp),
                senderName: msg.senderId === currentUserDbId
                  ? 'You'
                  : user?.displayName || user?.username || 'Unknown',
              }
            } catch (error) {
              console.error('[Chat Page] Failed to process message:', msg.messageId, error)
              return {
                id: msg.messageId,
                message: '[Failed to decrypt]',
                senderId: msg.senderId,
                receiverId: msg.receiverId,
                timestamp: new Date(msg.timestamp),
                senderName: msg.senderId === currentUserDbId
                  ? 'You'
                  : user?.displayName || user?.username || 'Unknown',
              }
            }
          })
        )

        setMessages(decryptedMessages)
        console.log('[Chat Page] Loaded and decrypted', decryptedMessages.length, 'messages')
      } catch (error) {
        console.error('Error loading chat:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadChat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkUserId, userId, router])

  // Set up message handler
  useEffect(() => {
    if (!isReady || !userId || !currentUserId) return

    const unsubscribe = onMessage(userId, async (encryptedMessage) => {
      try {
        // Generate message ID and store encrypted message first
        const messageId = crypto.randomUUID()
        const conversationId = getConversationId(currentUserId, userId)

        await storeMessage({
          messageId,
          conversationId,
          senderId: userId,
          receiverId: currentUserId,
          encryptedContent: encryptedMessage,
          timestamp: Date.now(),
          isSent: false,
        })

        console.log('[Chat Page] Stored incoming message in IndexedDB:', messageId)

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
            id: messageId,
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

  // Poll for queued offline messages when user comes online
  useEffect(() => {
    if (!isReady || !currentUserId) return

    let hasPolled = false // Prevent duplicate polling

    async function fetchQueuedMessages() {
      if (hasPolled) return
      hasPolled = true

      try {
        console.log('[Chat Page] Polling for queued offline messages...')
        const response = await fetch('/api/messages/queue')

        if (!response.ok) {
          console.error('[Chat Page] Failed to fetch queued messages:', response.status)
          return
        }

        const data = await response.json()
        const queuedMessages = data.messages || []

        console.log(`[Chat Page] Received ${queuedMessages.length} queued messages`)

        if (queuedMessages.length === 0) return

        // Get private key for decryption
        const deviceId = localStorage.getItem('p2p4everything-device-id')
        if (!deviceId) return

        const storedKeyPair = await getStoredKeyPair(deviceId)
        if (!storedKeyPair) return

        const keyPair = await importKeyPair(storedKeyPair)

        // Capture currentUserId to satisfy TypeScript
        if (!currentUserId) return

        // Process each queued message
        for (const msg of queuedMessages) {
          try {
            const conversationId = getConversationId(currentUserId, msg.senderId)

            // Store in IndexedDB
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

            // If viewing this conversation, decrypt and display
            if (msg.senderId === userId) {
              const decrypted = await decryptMessage(
                msg.encryptedContent,
                keyPair.privateKey
              )

              setMessages((prev) => [
                ...prev,
                {
                  id: msg.messageId,
                  message: decrypted,
                  senderId: msg.senderId,
                  receiverId: currentUserId,
                  timestamp: new Date(msg.timestamp),
                  senderName: msg.senderName || 'Unknown',
                },
              ])

              console.log('[Chat Page] Decrypted and displayed queued message:', msg.messageId)
            } else {
              console.log('[Chat Page] Stored queued message from another conversation:', msg.messageId)
            }
          } catch (error) {
            console.error('[Chat Page] Failed to process queued message:', msg.messageId, error)
          }
        }

        console.log('[Chat Page] Finished processing queued messages')
      } catch (error) {
        console.error('[Chat Page] Error fetching queued messages:', error)
      }
    }

    fetchQueuedMessages()
  }, [isReady, currentUserId, userId, user])

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

        // Log WebRTC connection status (but don't block sending)
        if (!isReady || !client) {
          console.log('[Chat Page] WebRTC not ready, will queue message on server')
        } else {
          const peerConnection = client.getPeerConnection(userId)
          if (peerConnection) {
            const connectionState = peerConnection.getConnectionState()
            const channelState = client.getDataChannelState(userId)
            console.log(`[Chat Page] WebRTC status - Connection: ${connectionState}, Channel: ${channelState}`)
          } else {
            console.log('[Chat Page] No peer connection found, will queue message on server')
          }
        }

        // Encrypt message for recipient
        const encryptedMessage = await encryptMessage(
          messageText,
          recipientPublicKey
        )

        // Get sender's own key pair to encrypt for local storage
        const deviceId = localStorage.getItem('p2p4everything-device-id')
        if (!deviceId) {
          throw new Error('No device ID found')
        }

        const storedKeyPair = await getStoredKeyPair(deviceId)
        if (!storedKeyPair) {
          throw new Error('No stored key pair found')
        }

        const senderKeyPair = await importKeyPair(storedKeyPair)

        // Encrypt message with sender's own public key for local storage
        const encryptedForStorage = await encryptMessage(
          messageText,
          senderKeyPair.publicKey
        )

        // Generate message ID
        const messageId = crypto.randomUUID()
        const conversationId = getConversationId(currentUserId, userId)

        // Store encrypted message in IndexedDB (encrypted with sender's own public key)
        await storeMessage({
          messageId,
          conversationId,
          senderId: currentUserId,
          receiverId: userId,
          encryptedContent: encryptedForStorage, // Store encrypted for defense in depth
          timestamp: Date.now(),
          isSent: true,
        })

        console.log('[Chat Page] Stored encrypted outgoing message in IndexedDB:', messageId)

        // Try to send via WebRTC first (returns false if not available)
        let success = false
        if (isReady && client) {
          success = sendMessage(userId, encryptedMessage)
        } else {
          console.log('[Chat Page] Skipping WebRTC send (not ready), will use server queue')
        }

        if (success) {
          // WebRTC send succeeded - create message metadata without encrypted content
          console.log('[Chat Page] Message sent via WebRTC successfully')

          const messageResponse = await fetch('/api/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              receiverId: userId,
              messageType: 'text',
              encryptedContentHash: '', // Optional: Add hash for verification
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
          // WebRTC failed - fallback to server queue for offline delivery
          console.log('[Chat Page] WebRTC send failed, queuing message on server for offline delivery')

          const messageResponse = await fetch('/api/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              receiverId: userId,
              messageType: 'text',
              encryptedContent: encryptedMessage, // Include encrypted content for offline queue
              encryptedContentHash: '',
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

            console.log('[Chat Page] Message queued on server, will be delivered when recipient comes online')
          } else {
            throw new Error('Failed to queue message on server')
          }
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

  const handleClearChat = useCallback(async () => {
    if (!userId || !currentUserId || isClearing) return

    // Show confirmation dialog
    const confirmed = window.confirm(
      'Are you sure you want to clear this chat? This will delete all messages locally and from the server. This action cannot be undone.'
    )

    if (!confirmed) return

    setIsClearing(true)
    setShowOptionsMenu(false)

    try {
      // Clear local IndexedDB messages
      const conversationId = getConversationId(currentUserId, userId)
      const deletedLocalCount = await clearConversation(conversationId)
      console.log(`[Clear Chat] Deleted ${deletedLocalCount} local messages`)

      // Clear server-side message metadata
      const response = await fetch(`/api/messages/conversation/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete messages from server')
      }

      const result = await response.json()
      console.log(`[Clear Chat] Deleted ${result.deletedCount} server messages`)

      // Clear messages from UI
      setMessages([])

      // Show success message
      alert(`Chat cleared successfully! Deleted ${deletedLocalCount} local messages and ${result.deletedCount} server messages.`)
    } catch (error) {
      console.error('[Clear Chat] Error clearing chat:', error)
      alert('Failed to clear chat. Please try again.')
    } finally {
      setIsClearing(false)
    }
  }, [userId, currentUserId, isClearing])

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
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {user.displayName || user.username || user.email || 'Unknown User'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              {isReady ? 'Connected' : 'Connecting...'}
            </p>
          </div>

          {/* Options Menu */}
          <div className="relative" ref={optionsMenuRef}>
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              aria-label="Options"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {showOptionsMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                <button
                  onClick={handleClearChat}
                  disabled={isClearing}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isClearing ? 'Clearing...' : 'Clear Chat'}
                </button>
              </div>
            )}
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

