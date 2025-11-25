'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import {
  generateMasterKey,
  encryptMasterKeyForDevice,
  decryptMasterKeyFromDevice,
  encryptMasterKeyForBackup,
  decryptMasterKeyFromBackup,
  deriveBackupKey,
  generateSalt,
  exportSalt,
  importSalt,
} from '@/lib/crypto/master-key'
import { getKeyPair } from '@/lib/crypto/storage'
import { importKeyPair } from '@/lib/crypto/keys'

export interface EncryptionState {
  isInitialized: boolean // Master key loaded and ready
  isLoading: boolean // Fetching/decrypting key
  error: string | null
  requiresSetup: boolean // First device, needs initialization
}

interface EncryptionKeyResponse {
  encryptedMasterKey: string | null
  keyType: 'device' | 'backup' | null
  salt?: string
}

const DEVICE_ID_KEY = 'p2p4everything-device-id'

/**
 * Hook for managing IndexedDB encryption state
 * Handles master key loading, initialization, and cleanup on logout
 */
export function useEncryption() {
  const { userId, isLoaded, getToken } = useAuth()
  const [state, setState] = useState<EncryptionState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    requiresSetup: false,
  })

  // Store master key in ref (never in state or storage)
  const masterKeyRef = useRef<CryptoKey | null>(null)
  const initializationAttempted = useRef(false)

  /**
   * Get the current master key (only available while logged in)
   */
  const getMasterKey = useCallback((): CryptoKey | null => {
    return masterKeyRef.current
  }, [])

  /**
   * Clear the master key from memory (on logout)
   */
  const clearMasterKey = useCallback(() => {
    console.log('[Encryption] Clearing master key from memory')
    masterKeyRef.current = null
    setState({
      isInitialized: false,
      isLoading: false,
      error: null,
      requiresSetup: false,
    })
    initializationAttempted.current = false
  }, [])

  /**
   * Initialize encryption for first device
   * Generates master key, encrypts for device and backup, stores on server
   */
  const initializeEncryption = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      setState((prev) => ({ ...prev, error: 'Not authenticated' }))
      return false
    }

    const deviceId = localStorage.getItem(DEVICE_ID_KEY)
    if (!deviceId) {
      setState((prev) => ({ ...prev, error: 'Device not registered' }))
      return false
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      // Get device's key pair for encryption
      const storedKeyPair = await getKeyPair(deviceId)
      if (!storedKeyPair) {
        throw new Error('Device key pair not found')
      }

      const keyPair = await importKeyPair(storedKeyPair)

      // Get session token for backup key derivation
      const sessionToken = await getToken()
      if (!sessionToken) {
        throw new Error('Session token not available')
      }

      // Generate new master key
      console.log('[Encryption] Generating new master key...')
      const masterKey = await generateMasterKey()

      // Encrypt master key for this device
      const encryptedForDevice = await encryptMasterKeyForDevice(
        masterKey,
        keyPair.publicKey
      )

      // Generate salt and derive backup key
      const salt = generateSalt()
      const backupKey = await deriveBackupKey(sessionToken, userId, salt)

      // Encrypt master key for backup
      const encryptedForBackup = await encryptMasterKeyForBackup(masterKey, backupKey)

      // Send to server
      const response = await fetch('/api/users/encryption-key/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          encryptedMasterKeyForDevice: encryptedForDevice,
          encryptedMasterKeyBackup: encryptedForBackup,
          backupSalt: exportSalt(salt),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to initialize encryption')
      }

      // Store master key in memory
      masterKeyRef.current = masterKey
      console.log('[Encryption] Master key initialized and stored in memory')

      setState({
        isInitialized: true,
        isLoading: false,
        error: null,
        requiresSetup: false,
      })

      return true
    } catch (error) {
      console.error('[Encryption] Initialization error:', error)
      setState({
        isInitialized: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requiresSetup: true,
      })
      return false
    }
  }, [userId, getToken])

  /**
   * Add encryption key for this device (subsequent device)
   * Decrypts master key from backup, encrypts for this device
   */
  const addDeviceKey = useCallback(
    async (
      encryptedBackupKey: string,
      backupSalt: string
    ): Promise<boolean> => {
      if (!userId) {
        setState((prev) => ({ ...prev, error: 'Not authenticated' }))
        return false
      }

      const deviceId = localStorage.getItem(DEVICE_ID_KEY)
      if (!deviceId) {
        setState((prev) => ({ ...prev, error: 'Device not registered' }))
        return false
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      try {
        // Get device's key pair
        const storedKeyPair = await getKeyPair(deviceId)
        if (!storedKeyPair) {
          throw new Error('Device key pair not found')
        }

        const keyPair = await importKeyPair(storedKeyPair)

        // Get session token for backup key derivation
        const sessionToken = await getToken()
        if (!sessionToken) {
          throw new Error('Session token not available')
        }

        // Derive backup key
        const salt = importSalt(backupSalt)
        const backupKey = await deriveBackupKey(sessionToken, userId, salt)

        // Decrypt master key from backup
        console.log('[Encryption] Decrypting master key from backup...')
        const masterKey = await decryptMasterKeyFromBackup(encryptedBackupKey, backupKey)

        // Encrypt master key for this device
        const encryptedForDevice = await encryptMasterKeyForDevice(
          masterKey,
          keyPair.publicKey
        )

        // Send to server
        const response = await fetch('/api/users/encryption-key/add-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            encryptedMasterKey: encryptedForDevice,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to add device key')
        }

        // Store master key in memory
        masterKeyRef.current = masterKey
        console.log('[Encryption] Master key loaded and stored in memory')

        setState({
          isInitialized: true,
          isLoading: false,
          error: null,
          requiresSetup: false,
        })

        return true
      } catch (error) {
        console.error('[Encryption] Add device key error:', error)
        setState({
          isInitialized: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          requiresSetup: false,
        })
        return false
      }
    },
    [userId, getToken]
  )

  // Load encryption key on mount
  useEffect(() => {
    // Clear master key when user logs out
    if (isLoaded && !userId) {
      clearMasterKey()
      return
    }

    // Wait for auth to be ready
    if (!isLoaded || !userId) {
      return
    }

    // Don't attempt initialization twice
    if (initializationAttempted.current) {
      return
    }

    async function loadEncryptionKey() {
      initializationAttempted.current = true
      setState((prev) => ({ ...prev, isLoading: true, error: null }))

      // Helper to check if device ID is a proper UUID (server-assigned)
      // Temporary IDs look like "device-1234567890-abc123"
      const isProperDeviceId = (id: string) => {
        // UUID pattern: 8-4-4-4-12 hex characters
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      }

      // Wait for proper device ID with retries
      // Device registration may still be in progress
      let deviceId = localStorage.getItem(DEVICE_ID_KEY)
      let retries = 10
      while ((!deviceId || !isProperDeviceId(deviceId)) && retries > 0) {
        console.log(`[Encryption] Waiting for device registration to complete... (attempt ${11 - retries})`)
        await new Promise(resolve => setTimeout(resolve, 500))
        deviceId = localStorage.getItem(DEVICE_ID_KEY)
        retries--
      }

      if (!deviceId) {
        console.log('[Encryption] No device ID found after waiting, will retry later')
        setState({
          isInitialized: false,
          isLoading: false,
          error: null,
          requiresSetup: false,
        })
        initializationAttempted.current = false
        return
      }

      if (!isProperDeviceId(deviceId)) {
        console.log('[Encryption] Device ID not yet updated to server ID, will retry later')
        setState({
          isInitialized: false,
          isLoading: false,
          error: null,
          requiresSetup: false,
        })
        initializationAttempted.current = false
        return
      }

      console.log('[Encryption] Using device ID:', deviceId)

      try {
        // Fetch encryption key from server
        const response = await fetch(`/api/users/encryption-key?deviceId=${deviceId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch encryption key')
        }

        const data: EncryptionKeyResponse = await response.json()

        // No encryption keys found - first device needs to initialize
        if (!data.encryptedMasterKey) {
          console.log('[Encryption] No encryption keys found, setup required')
          setState({
            isInitialized: false,
            isLoading: false,
            error: null,
            requiresSetup: true,
          })
          return
        }

        // Get device's key pair
        const storedKeyPair = await getKeyPair(deviceId)
        if (!storedKeyPair) {
          console.log('[Encryption] No device key pair found, waiting for device registration')
          setState({
            isInitialized: false,
            isLoading: false,
            error: null,
            requiresSetup: false,
          })
          initializationAttempted.current = false
          return
        }

        const keyPair = await importKeyPair(storedKeyPair)

        // Decrypt based on key type
        if (data.keyType === 'device') {
          // Decrypt with device's private key
          console.log('[Encryption] Decrypting master key with device key...')
          const masterKey = await decryptMasterKeyFromDevice(
            data.encryptedMasterKey,
            keyPair.privateKey
          )
          masterKeyRef.current = masterKey
          console.log('[Encryption] Master key loaded from device key')
        } else if (data.keyType === 'backup' && data.salt) {
          // Need to decrypt from backup and create device key
          console.log('[Encryption] Decrypting master key from backup...')

          // Get session token
          const sessionToken = await getToken()
          if (!sessionToken) {
            throw new Error('Session token not available')
          }

          // Derive backup key and decrypt
          const salt = importSalt(data.salt)
          // userId is guaranteed to be non-null here due to earlier check
          const backupKey = await deriveBackupKey(sessionToken, userId!, salt)
          const masterKey = await decryptMasterKeyFromBackup(
            data.encryptedMasterKey,
            backupKey
          )

          // Encrypt for this device and store
          const encryptedForDevice = await encryptMasterKeyForDevice(
            masterKey,
            keyPair.publicKey
          )

          // Add device key to server
          const addDeviceResponse = await fetch('/api/users/encryption-key/add-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId,
              encryptedMasterKey: encryptedForDevice,
            }),
          })

          if (!addDeviceResponse.ok) {
            console.warn('[Encryption] Failed to store device key, will retry next time')
          }

          masterKeyRef.current = masterKey
          console.log('[Encryption] Master key loaded from backup and device key created')
        } else {
          throw new Error('Invalid encryption key data')
        }

        setState({
          isInitialized: true,
          isLoading: false,
          error: null,
          requiresSetup: false,
        })
      } catch (error) {
        console.error('[Encryption] Error loading encryption key:', error)
        setState({
          isInitialized: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          requiresSetup: false,
        })
      }
    }

    // Small delay to ensure device registration has completed
    const timeout = setTimeout(loadEncryptionKey, 500)
    return () => clearTimeout(timeout)
  }, [userId, isLoaded, getToken, clearMasterKey])

  return {
    state,
    getMasterKey,
    clearMasterKey,
    initializeEncryption,
    addDeviceKey,
  }
}
