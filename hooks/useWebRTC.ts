'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { WebRTCClient } from '@/lib/webrtc/client'
import { useSignaling } from './useSignaling'

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'ws://localhost:3001'

export function useWebRTC() {
  const { getToken } = useAuth()
  const { signaling, isConnected: isSignalingConnected } = useSignaling()
  const [isReady, setIsReady] = useState(false)
  const [connectedPeers, setConnectedPeers] = useState<Set<string>>(new Set())
  const clientRef = useRef<WebRTCClient | null>(null)
  const messageHandlersRef = useRef<Map<string, (message: string) => void>>(
    new Map()
  )

  useEffect(() => {
    if (!isSignalingConnected) {
      return
    }

    async function initClient() {
      try {
        const token = await getToken()
        const deviceId = localStorage.getItem('p2p4everything-device-id')

        const client = new WebRTCClient({
          signalingUrl: SIGNALING_URL,
          token: token || undefined,
          deviceId: deviceId || undefined,
          onMessage: (message, fromUserId) => {
            if (fromUserId) {
              const handler = messageHandlersRef.current.get(fromUserId)
              if (handler) {
                handler(message)
              }
            }
          },
          onConnectionChange: (connected) => {
            setIsReady(connected)
          },
          onPeerConnectionChange: (state) => {
            // Handle peer connection state changes
            console.log('Peer connection state:', state)
          },
        })

        await client.connect()
        clientRef.current = client
        setIsReady(true)
      } catch (error) {
        console.error('Error initializing WebRTC client:', error)
        setIsReady(false)
      }
    }

    initClient()

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
      setIsReady(false)
    }
  }, [isSignalingConnected, getToken])

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

  return {
    client: clientRef.current,
    isReady,
    isSignalingConnected,
    connectedPeers: Array.from(connectedPeers),
    connectToPeer,
    sendMessage,
    onMessage,
    disconnectFromPeer,
  }
}

