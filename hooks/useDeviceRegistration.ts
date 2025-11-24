'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import {
  generateKeyPair,
  exportKeyPair,
  exportPublicKey,
  importPublicKey,
  getKeyFingerprint,
} from '@/lib/crypto/keys'
import { storeKeyPair, getKeyPair, hasKeyPair } from '@/lib/crypto/storage'

interface DeviceRegistrationState {
  deviceId: string | null
  isRegistered: boolean
  isRegistering: boolean
  error: string | null
  publicKeyFingerprint: string | null
}

const DEVICE_ID_KEY = 'p2p4everything-device-id'
const DEVICE_NAME_KEY = 'p2p4everything-device-name'

/**
 * Get or create a device ID stored in localStorage
 */
function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

/**
 * Get device name from localStorage or generate one
 */
function getDeviceName(): string {
  let deviceName = localStorage.getItem(DEVICE_NAME_KEY)
  if (!deviceName) {
    const userAgent = navigator.userAgent
    if (userAgent.includes('Mobile')) {
      deviceName = 'Mobile Device'
    } else if (userAgent.includes('Tablet')) {
      deviceName = 'Tablet'
    } else {
      deviceName = 'Web Browser'
    }
    localStorage.setItem(DEVICE_NAME_KEY, deviceName)
  }
  return deviceName
}

/**
 * Detect device type
 */
function getDeviceType(): 'web' | 'mobile' | 'desktop' {
  const userAgent = navigator.userAgent
  if (userAgent.includes('Mobile')) {
    return 'mobile'
  } else if (userAgent.includes('Tablet')) {
    return 'mobile'
  }
  return 'web'
}

/**
 * Hook for automatic device registration with encryption key generation
 */
export function useDeviceRegistration() {
  const { userId, isLoaded } = useAuth()
  const [state, setState] = useState<DeviceRegistrationState>({
    deviceId: null,
    isRegistered: false,
    isRegistering: false,
    error: null,
    publicKeyFingerprint: null,
  })

  useEffect(() => {
    if (!isLoaded || !userId) {
      return
    }

    async function registerDevice() {
      const deviceId = getDeviceId()
      setState((prev) => ({ ...prev, deviceId, isRegistering: true, error: null }))

      try {
        // Check if device already has keys stored
        const hasKeys = await hasKeyPair(deviceId)

        let publicKeyString: string

        if (!hasKeys) {
          // Generate new key pair
          const keyPair = await generateKeyPair()
          const exported = await exportKeyPair(keyPair)
          
          // Store keys locally
          await storeKeyPair(deviceId, exported)
          
          // Export public key for registration
          publicKeyString = await exportPublicKey(keyPair.publicKey)
        } else {
          // Retrieve existing keys
          const stored = await getKeyPair(deviceId)
          if (!stored) {
            throw new Error('Failed to retrieve stored keys')
          }
          
          // Import and export public key
          const { importPublicKey } = await import('@/lib/crypto/keys')
          const publicKey = await importPublicKey(stored.publicKey)
          publicKeyString = await exportPublicKey(publicKey)
        }

        // Check if device is already registered on server
        const devicesResponse = await fetch('/api/devices')
        if (!devicesResponse.ok) {
          throw new Error('Failed to fetch devices')
        }

        const devices = await devicesResponse.json()
        const existingDevice = devices.find((d: any) => d.id === deviceId)

        if (!existingDevice) {
          // Register device on server
          const deviceName = getDeviceName()
          const deviceType = getDeviceType()

          const registerResponse = await fetch('/api/devices/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deviceName,
              deviceType,
              publicKey: publicKeyString,
            }),
          })

          if (!registerResponse.ok) {
            const error = await registerResponse.json()
            throw new Error(error.error || 'Failed to register device')
          }

          const registeredDevice = await registerResponse.json()
          
          // Calculate fingerprint for display
          const publicKey = await importPublicKey(publicKeyString)
          const fingerprint = await getKeyFingerprint(publicKey)

          setState({
            deviceId: registeredDevice.id,
            isRegistered: true,
            isRegistering: false,
            error: null,
            publicKeyFingerprint: fingerprint,
          })
        } else {
          // Device already registered, just update lastSeen
          const publicKey = await importPublicKey(publicKeyString)
          const fingerprint = await getKeyFingerprint(publicKey)

          setState({
            deviceId: existingDevice.id,
            isRegistered: true,
            isRegistering: false,
            error: null,
            publicKeyFingerprint: fingerprint,
          })

          // Update lastSeen (optional, can be done periodically)
          // This is handled by the periodic update below
        }
      } catch (error) {
        console.error('Device registration error:', error)
        setState((prev) => ({
          ...prev,
          isRegistering: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }))
      }
    }

    registerDevice()

    // Update lastSeen periodically (every 5 minutes)
    const interval = setInterval(async () => {
      const deviceId = getDeviceId()
      if (deviceId && state.isRegistered) {
        // Silently update lastSeen by fetching devices
        // The server can update lastSeen on device access
        try {
          await fetch('/api/devices')
        } catch (error) {
          // Silently fail
        }
      }
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [userId, isLoaded, state.isRegistered])

  return state
}

