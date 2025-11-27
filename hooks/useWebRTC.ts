'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { WebRTCClient } from '@/lib/webrtc/client'

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'ws://localhost:3001'

export function useWebRTC() {
  const { getToken } = useAuth()
  const [isReady, setIsReady] = useState(false)
  const [isSignalingConnected, setIsSignalingConnected] = useState(false)
  const [connectedPeers, setConnectedPeers] = useState<Set<string>>(new Set())
  const [client, setClient] = useState<WebRTCClient | null>(null)
  const clientRef = useRef<WebRTCClient | null>(null)
  const messageHandlersRef = useRef<Map<string, (message: string) => void>>(
    new Map()
  )

  // Listen for send-key-rotated events to broadcast to other devices
  useEffect(() => {
    const handleSendKeyRotated = (event: Event) => {
      const customEvent = event as CustomEvent
      const { deviceId, keyVersion } = customEvent.detail || {}

      if (clientRef.current?.signaling) {
        console.log(`[useWebRTC] Sending key-rotated notification: device=${deviceId}, version=${keyVersion}`)
        clientRef.current.signaling.sendKeyRotated(deviceId, keyVersion)
      } else {
        console.warn('[useWebRTC] Cannot send key-rotated: signaling client not ready')
      }
    }

    window.addEventListener('send-key-rotated', handleSendKeyRotated)
    return () => {
      window.removeEventListener('send-key-rotated', handleSendKeyRotated)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function initClient() {
      try {
        const token = await getToken()
        const deviceId = localStorage.getItem('p2p4everything-device-id')

        // Fetch database user ID
        let databaseUserId: string | undefined
        try {
          const userResponse = await fetch('/api/users/me')
          if (userResponse.ok) {
            const userData = await userResponse.json()
            databaseUserId = userData.id
          }
        } catch (error) {
          console.warn('[useWebRTC] Failed to fetch database user ID:', error)
        }

        const newClient = new WebRTCClient({
          signalingUrl: SIGNALING_URL,
          token: token || undefined,
          deviceId: deviceId || undefined,
          databaseUserId: databaseUserId,
          onMessage: (message, fromUserId) => {
            if (fromUserId) {
              const handler = messageHandlersRef.current.get(fromUserId)
              if (handler) {
                handler(message)
              }
            }
          },
          onConnectionChange: (connected) => {
            if (mounted) {
              setIsSignalingConnected(connected)
              setIsReady(connected)
            }
          },
          onPeerConnectionChange: (state) => {
            // Handle peer connection state changes
            console.log('Peer connection state:', state)
          },
        })

        await newClient.connect()

        if (mounted) {
          clientRef.current = newClient
          setClient(newClient)
          setIsSignalingConnected(true)
          setIsReady(true)
          console.log('[useWebRTC] Client initialized and ready')

          // Listen for key-rotated messages from signaling server
          newClient.signaling?.onMessage('key-rotated', (message) => {
            if (message.type === 'key-rotated') {
              console.log('[useWebRTC] Received key-rotated notification:', message)
              // Dispatch custom event that EncryptionProvider listens to
              window.dispatchEvent(new CustomEvent('key-rotated', {
                detail: {
                  fromDeviceId: message.fromDeviceId,
                  keyVersion: message.keyVersion,
                  timestamp: message.timestamp,
                }
              }))
            }
          })
        } else {
          // Component unmounted during init, clean up
          newClient.disconnect()
        }
      } catch (error) {
        console.error('Error initializing WebRTC client:', error)
        if (mounted) {
          setIsReady(false)
        }
      }
    }

    initClient()

    return () => {
      mounted = false
      if (clientRef.current) {
        console.log('[useWebRTC] Cleaning up client')
        clientRef.current.disconnect()
        clientRef.current = null
      }
      setClient(null)
      setIsReady(false)
      setIsSignalingConnected(false)
    }
  }, [getToken])

  const connectToPeer = useCallback(
    async (userId: string, connectionId?: string, roomId?: string) => {
      if (!clientRef.current) {
        throw new Error('WebRTC client not initialized')
      }

      const peer = await clientRef.current.connectToPeer(
        userId,
        connectionId,
        roomId
      )

      setConnectedPeers((prev) => new Set(prev).add(userId))

      return peer
    },
    []
  )

  const sendMessage = useCallback((userId: string, message: string): boolean => {
    if (!clientRef.current) {
      console.warn('WebRTC client not initialized')
      return false
    }

    // Check if data channel is open
    const isOpen = clientRef.current.isDataChannelOpen(userId)
    if (!isOpen) {
      const state = clientRef.current.getDataChannelState(userId)
      console.warn(
        `Cannot send message: data channel for user ${userId} is not open. ` +
        `State: ${state || 'not found'}. ` +
        `The peer connection may still be establishing. Please wait a moment and try again.`
      )
      return false
    }

    const success = clientRef.current.sendMessage(userId, message)
    if (success) {
      setConnectedPeers((prev) => new Set(prev).add(userId))
    }
    return success
  }, [])

  const onMessage = useCallback(
    (userId: string, handler: (message: string) => void) => {
      messageHandlersRef.current.set(userId, handler)

      return () => {
        messageHandlersRef.current.delete(userId)
      }
    },
    []
  )

  const disconnectFromPeer = useCallback((userId: string) => {
    if (clientRef.current) {
      const peer = clientRef.current.getPeerConnection(userId)
      if (peer) {
        peer.close()
      }
    }
    setConnectedPeers((prev) => {
      const next = new Set(prev)
      next.delete(userId)
      return next
    })
  }, [])

  const onNotification = useCallback(
    (handler: (senderId: string) => void) => {
      if (!clientRef.current) {
        console.warn('[useWebRTC] Cannot set notification handler: client not initialized')
        return () => {}
      }

      // Listen for message-notification events from signaling server
      const unsubscribe = clientRef.current.signaling?.onMessage('message-notification', (message) => {
        if (message.type === 'message-notification' && message.senderId) {
          console.log('[useWebRTC] Received message notification from:', message.senderId)
          handler(message.senderId)
        }
      })

      return unsubscribe || (() => {})
    },
    []
  )

  return {
    client, // Now returns state, not ref - triggers re-renders!
    isReady,
    isSignalingConnected,
    connectedPeers: Array.from(connectedPeers),
    connectToPeer,
    sendMessage,
    onMessage,
    onNotification,
    disconnectFromPeer,
  }
}

