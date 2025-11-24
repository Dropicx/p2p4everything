'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { SignalingClient } from '@/lib/webrtc/signaling'

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'ws://localhost:3001'

export function useSignaling() {
  const { getToken } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const signalingRef = useRef<SignalingClient | null>(null)

  useEffect(() => {
    let signaling: SignalingClient | null = null

    async function connect() {
      try {
        const token = await getToken()
        const deviceId = localStorage.getItem('p2p4everything-device-id')

        signaling = new SignalingClient(SIGNALING_URL, (connected) => {
          setIsConnected(connected)
        })

        signalingRef.current = signaling

        // Handle connection confirmation
        signaling.onMessage('connected', (message) => {
          if (message.type === 'connected') {
            setConnectionId(message.connectionId)
          }
        })

        await signaling.connect(token || undefined, deviceId || undefined)
      } catch (error) {
        console.error('Error connecting to signaling server:', error)
        setIsConnected(false)
      }
    }

    connect()

    return () => {
      if (signaling) {
        signaling.disconnect()
      }
      signalingRef.current = null
    }
  }, [getToken])

  return {
    signaling: signalingRef.current,
    isConnected,
    connectionId,
  }
}

