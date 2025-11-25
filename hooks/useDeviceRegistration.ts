'use client'

import { useEffect, useState, useRef } from 'react'
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
const DEVICE_REGISTERED_KEY = 'p2p4everything-device-registered'

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
    const platform = navigator.platform || ''
    
    // More specific device detection
    if (/iPhone|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
      // Try to detect specific device
      if (/iPhone/i.test(userAgent)) {
        deviceName = 'iPhone'
      } else if (/iPad/i.test(userAgent)) {
        deviceName = 'iPad'
      } else if (/Android/i.test(userAgent)) {
        // Try to get Android version or model
        const androidMatch = userAgent.match(/Android\s([0-9\.]*)/)
        deviceName = androidMatch ? `Android ${androidMatch[1]}` : 'Android Device'
      } else {
        deviceName = 'Mobile Device'
      }
    } else if (/Tablet|iPad/i.test(userAgent)) {
      deviceName = 'Tablet'
    } else {
      // Desktop browser - include browser name
      const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera|Vivaldi)\/([0-9\.]*)/)
      if (browserMatch) {
        deviceName = `${browserMatch[1]} Browser`
      } else {
        deviceName = 'Web Browser'
      }
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
  const { userId, isLoaded, sessionId } = useAuth()
  const [state, setState] = useState<DeviceRegistrationState>({
    deviceId: null,
    isRegistered: false,
    isRegistering: false,
    error: null,
    publicKeyFingerprint: null,
  })
  const registrationInProgress = useRef(false)

  useEffect(() => {
    // Wait for Clerk to be fully loaded AND have a session
    // sessionId ensures the auth cookie is set and ready
    if (!isLoaded || !userId || !sessionId) {
      return
    }

    // Prevent duplicate registrations
    if (registrationInProgress.current) {
      return
    }

    async function registerDevice() {
      // Check browser capabilities first
      if (!window.crypto || !window.crypto.subtle) {
        setState((prev) => ({
          ...prev,
          isRegistering: false,
          error: 'Web Crypto API is not available in this browser. Please use a modern browser.',
        }))
        return
      }

      if (!window.indexedDB) {
        setState((prev) => ({
          ...prev,
          isRegistering: false,
          error: 'IndexedDB is not available in this browser. Please use a modern browser.',
        }))
        return
      }

      // Check if already registered in this session
      const alreadyRegistered = localStorage.getItem(DEVICE_REGISTERED_KEY)
      if (alreadyRegistered === 'true') {
        // Verify device is actually registered on server
        try {
          const deviceId = getDeviceId()
          const storedKeyPair = await getKeyPair(deviceId)
          if (storedKeyPair) {
            // Verify device exists on server
            const devicesResponse = await fetch('/api/devices')
            if (devicesResponse.ok) {
              const devices = await devicesResponse.json()
              const deviceName = getDeviceName()
              const deviceType = getDeviceType()
              const serverDevice = devices.find(
                (d: any) => d.deviceName === deviceName && d.deviceType === deviceType
              )

              if (serverDevice) {
                // Device exists on server
                // IMPORTANT: Migrate device ID if localStorage has old format
                const oldDeviceId = localStorage.getItem(DEVICE_ID_KEY)
                const newDeviceId = serverDevice.id

                if (oldDeviceId && oldDeviceId !== newDeviceId) {
                  console.log('[Device Registration] Migrating device ID from', oldDeviceId, 'to', newDeviceId)

                  // Migrate the key pair to the new device ID
                  const storedKeys = await getKeyPair(oldDeviceId)
                  if (storedKeys) {
                    await storeKeyPair(newDeviceId, storedKeys)
                    console.log('[Device Registration] Migrated key pair to new device ID')
                  }

                  // Update localStorage with the server's device ID
                  localStorage.setItem(DEVICE_ID_KEY, newDeviceId)
                }

                // Load state
                const publicKey = await importPublicKey(storedKeyPair.publicKey)
                const fingerprint = await getKeyFingerprint(publicKey)
                setState({
                  deviceId: serverDevice.id,
                  isRegistered: true,
                  isRegistering: false,
                  error: null,
                  publicKeyFingerprint: fingerprint,
                })
                return
              } else {
                // Device not on server, clear flag and re-register
                console.log('[Device Registration] Device marked as registered but not found on server, re-registering...')
                localStorage.removeItem(DEVICE_REGISTERED_KEY)
              }
            }
          }
        } catch (error) {
          console.error('[Device Registration] Error verifying device registration:', error)
          // Clear flag and try to register again
          localStorage.removeItem(DEVICE_REGISTERED_KEY)
        }
      }

      registrationInProgress.current = true
      const deviceId = getDeviceId()
      setState((prev) => ({ ...prev, deviceId, isRegistering: true, error: null }))

      try {
        // Check if device already has keys stored
        const hasKeys = await hasKeyPair(deviceId)
        // Track if we generated fresh keys (need to update server even if device exists)
        let keysWereFreshlyGenerated = false

        let publicKeyString: string

        if (!hasKeys) {
          // Generate new key pair
          console.log('[Device Registration] No local keys found, generating new key pair...')
          const keyPair = await generateKeyPair()
          const exported = await exportKeyPair(keyPair)

          // Store keys locally
          await storeKeyPair(deviceId, exported)

          // Export public key for registration
          publicKeyString = await exportPublicKey(keyPair.publicKey)
          keysWereFreshlyGenerated = true
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
        // Add retry logic for auth timing issues
        let devicesResponse: Response | null = null
        let retries = 3
        let lastError: Error | null = null

        while (retries > 0) {
          try {
            devicesResponse = await fetch('/api/devices', {
              credentials: 'include', // Ensure cookies are sent
            })
            
            if (devicesResponse.ok) {
              break // Success, exit retry loop
            }

            // If unauthorized, wait a bit and retry (auth might not be ready)
            if (devicesResponse.status === 401 && retries > 1) {
              console.log(`[Device Registration] Auth not ready, retrying in ${(4 - retries) * 200}ms...`)
              await new Promise(resolve => setTimeout(resolve, (4 - retries) * 200))
              retries--
              continue
            }

            // For other errors, break and handle below
            break
          } catch (fetchError) {
            lastError = fetchError instanceof Error ? fetchError : new Error('Network error')
            retries--
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, (4 - retries) * 200))
            }
          }
        }

        if (!devicesResponse || !devicesResponse.ok) {
          const contentType = devicesResponse?.headers.get('content-type')
          let errorMessage = 'Failed to fetch devices'

          if (devicesResponse?.status === 401) {
            errorMessage = 'Authentication not ready. Please wait a moment and refresh the page.'
          } else if (devicesResponse && contentType && contentType.includes('application/json')) {
            try {
              const error = await devicesResponse.json()
              errorMessage = error.error || errorMessage
            } catch (parseError) {
              errorMessage = `Server error (${devicesResponse?.status}): ${devicesResponse?.statusText}`
            }
          } else {
            errorMessage = `Server error (${devicesResponse?.status || 'unknown'}): ${devicesResponse?.statusText || 'Unknown error'}. The API endpoint may not be available.`
          }

          if (lastError) {
            throw lastError
          }
          throw new Error(errorMessage)
        }

        // Check if response is JSON
        const contentType = devicesResponse.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await devicesResponse.text()
          console.error('[Device Registration] Server returned non-JSON response for /api/devices:', {
            contentType,
            preview: text.substring(0, 200),
          })
          throw new Error('Server returned invalid response format when fetching devices')
        }

        const devices = await devicesResponse.json()
        const deviceName = getDeviceName()
        const deviceType = getDeviceType()

        // Check if a device with same name and type already exists for this user
        const existingDevice = devices.find((d: any) =>
          d.deviceName === deviceName && d.deviceType === deviceType
        )

        if (!existingDevice) {
          // Register device on server
          // Add retry logic for auth timing issues
          console.log('[Device Registration] Registering new device with public key length:', publicKeyString.length)
          
          let registerResponse: Response | null = null
          let retries = 3
          let lastError: Error | null = null

          while (retries > 0) {
            try {
              registerResponse = await fetch('/api/devices/register', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include', // Ensure cookies are sent
                body: JSON.stringify({
                  deviceName,
                  deviceType,
                  publicKey: publicKeyString,
                }),
              })
              
              if (registerResponse.ok) {
                break // Success, exit retry loop
              }

              // If unauthorized, wait a bit and retry (auth might not be ready)
              if (registerResponse.status === 401 && retries > 1) {
                console.log(`[Device Registration] Auth not ready, retrying in ${(4 - retries) * 200}ms...`)
                await new Promise(resolve => setTimeout(resolve, (4 - retries) * 200))
                retries--
                continue
              }

              // For other errors, break and handle below
              break
            } catch (fetchError) {
              lastError = fetchError instanceof Error ? fetchError : new Error('Network error')
              retries--
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, (4 - retries) * 200))
              }
            }
          }

          if (!registerResponse) {
            throw lastError || new Error('Failed to register device: No response from server')
          }

          if (!registerResponse.ok) {
            // Check if response is JSON
            const contentType = registerResponse.headers.get('content-type')
            let errorMessage = 'Failed to register device'
            
            if (registerResponse.status === 401) {
              errorMessage = 'Authentication not ready. Please wait a moment and refresh the page if this persists.'
            } else if (contentType && contentType.includes('application/json')) {
              try {
                const error = await registerResponse.json()
                errorMessage = error.error || errorMessage
              } catch (parseError) {
                console.error('[Device Registration] Failed to parse error response:', parseError)
                errorMessage = `Server error (${registerResponse.status}): ${registerResponse.statusText}`
              }
            } else {
              // Response is HTML (error page)
              const text = await registerResponse.text()
              console.error('[Device Registration] Server returned HTML instead of JSON:', {
                status: registerResponse.status,
                statusText: registerResponse.statusText,
                preview: text.substring(0, 200),
              })
              errorMessage = `Server error (${registerResponse.status}): ${registerResponse.statusText}. The API endpoint may not be available.`
            }
            
            console.error('[Device Registration] Registration failed:', errorMessage)
            throw new Error(errorMessage)
          }

          // Check if response is JSON before parsing
          const contentType = registerResponse.headers.get('content-type')
          if (!contentType || !contentType.includes('application/json')) {
            const text = await registerResponse.text()
            console.error('[Device Registration] Server returned non-JSON response:', {
              contentType,
              preview: text.substring(0, 200),
            })
            throw new Error('Server returned invalid response format')
          }

          const registeredDevice = await registerResponse.json()
          console.log('[Device Registration] Device registered successfully:', {
            id: registeredDevice.id,
            hasPublicKey: !!registeredDevice.publicKey,
            publicKeyLength: registeredDevice.publicKey?.length || 0,
          })

          // IMPORTANT: Update localStorage with the server's device ID (UUID)
          // This ensures the device ID used for encryption matches the database ID
          const oldDeviceId = localStorage.getItem(DEVICE_ID_KEY)
          const newDeviceId = registeredDevice.id

          if (oldDeviceId !== newDeviceId) {
            console.log('[Device Registration] Updating device ID from', oldDeviceId, 'to', newDeviceId)

            // Migrate the key pair to the new device ID
            const storedKeys = await getKeyPair(oldDeviceId || deviceId)
            if (storedKeys) {
              await storeKeyPair(newDeviceId, storedKeys)
              console.log('[Device Registration] Migrated key pair to new device ID')
            }

            // Update localStorage with the server's device ID
            localStorage.setItem(DEVICE_ID_KEY, newDeviceId)
          }

          // Calculate fingerprint for display
          const publicKey = await importPublicKey(publicKeyString)
          const fingerprint = await getKeyFingerprint(publicKey)

          // Mark as registered in localStorage
          localStorage.setItem(DEVICE_REGISTERED_KEY, 'true')

          setState({
            deviceId: registeredDevice.id,
            isRegistered: true,
            isRegistering: false,
            error: null,
            publicKeyFingerprint: fingerprint,
          })
        } else {
          // Device already registered
          console.log('[Device Registration] Device already exists:', {
            id: existingDevice.id,
            deviceName: existingDevice.deviceName,
            hasPublicKey: !!existingDevice.publicKey,
            publicKeyType: typeof existingDevice.publicKey,
            publicKeyLength: existingDevice.publicKey?.length || 0,
          })
          
          // Check if server needs public key update:
          // 1. Device has no public key on server, OR
          // 2. We just generated fresh local keys (e.g., user cleared cache)
          const serverHasNoKey = !existingDevice.publicKey ||
            (typeof existingDevice.publicKey === 'string' && existingDevice.publicKey.trim() === '')
          const needsUpdate = serverHasNoKey || keysWereFreshlyGenerated

          if (needsUpdate) {
            console.log('[Device Registration] Updating server public key:', {
              serverHasNoKey,
              keysWereFreshlyGenerated,
            })
            // Update device with public key
            try {
              const updateResponse = await fetch(`/api/devices/${existingDevice.id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  publicKey: publicKeyString,
                }),
              })

              if (!updateResponse.ok) {
                const contentType = updateResponse.headers.get('content-type')
                let errorMessage = 'Failed to update device public key'
                
                if (contentType && contentType.includes('application/json')) {
                  try {
                    const error = await updateResponse.json()
                    errorMessage = error.error || errorMessage
                  } catch (parseError) {
                    errorMessage = `Server error (${updateResponse.status}): ${updateResponse.statusText}`
                  }
                } else {
                  errorMessage = `Server error (${updateResponse.status}): ${updateResponse.statusText}`
                }
                
                console.warn('[Device Registration] Failed to update device public key:', errorMessage)
              } else {
                console.log('[Device Registration] Successfully updated device public key')
              }
            } catch (updateError) {
              console.error('[Device Registration] Error updating device public key:', updateError)
            }
          } else {
            console.log('[Device Registration] Device already has public key, skipping update')
          }

          // IMPORTANT: Update localStorage with the server's device ID (UUID)
          // This ensures the device ID used for encryption matches the database ID
          const oldDeviceId = localStorage.getItem(DEVICE_ID_KEY)
          const newDeviceId = existingDevice.id

          if (oldDeviceId !== newDeviceId) {
            console.log('[Device Registration] Updating device ID from', oldDeviceId, 'to', newDeviceId)

            // Migrate the key pair to the new device ID
            const storedKeys = await getKeyPair(oldDeviceId || deviceId)
            if (storedKeys) {
              await storeKeyPair(newDeviceId, storedKeys)
              console.log('[Device Registration] Migrated key pair to new device ID')
            }

            // Update localStorage with the server's device ID
            localStorage.setItem(DEVICE_ID_KEY, newDeviceId)
          }

          const publicKey = await importPublicKey(publicKeyString)
          const fingerprint = await getKeyFingerprint(publicKey)

          // Mark as registered in localStorage
          localStorage.setItem(DEVICE_REGISTERED_KEY, 'true')

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
        console.error('[Device Registration] Device registration error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Provide more helpful error messages
        let userFriendlyError = errorMessage
        if (errorMessage.includes('IndexedDB')) {
          userFriendlyError = 'Failed to store encryption keys. Please check your browser settings and allow storage.'
        } else if (errorMessage.includes('crypto') || errorMessage.includes('Crypto')) {
          userFriendlyError = 'Encryption is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.'
        } else if (errorMessage.includes('Failed to fetch')) {
          userFriendlyError = 'Network error. Please check your internet connection and try again.'
        }
        
        setState((prev) => ({
          ...prev,
          isRegistering: false,
          error: userFriendlyError,
        }))
      } finally {
        registrationInProgress.current = false
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
  }, [userId, isLoaded, sessionId, state.isRegistered])

  return state
}

