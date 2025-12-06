'use client'

import { createContext, useContext, ReactNode, useEffect, useRef } from 'react'
import { useEncryption, EncryptionState } from '@/hooks/useEncryption'
import { initializeEncryptedKeyStorage, migrateKeysToEncrypted } from '@/lib/crypto/storage'
import { initializeEncryptedMessageStorage, migrateMessagesToEncrypted } from '@/lib/crypto/message-storage'

interface EncryptionContextValue {
  state: EncryptionState
  getMasterKey: () => CryptoKey | null
  /** Initialize encryption for first device with a backup password */
  initializeEncryption: (backupPassword: string) => Promise<boolean>
  /** Unlock encryption on a new device using the backup password */
  unlockWithBackupPassword: (backupPassword: string) => Promise<boolean>
  /** Rotate the master encryption key (requires backup password) */
  rotateMasterKey: (
    backupPassword: string,
    newBackupPassword?: string,
    onProgress?: (progress: number) => void,
    rotationLogId?: string
  ) => Promise<boolean>
  /** Refresh the master key from the server (called when another device rotates) */
  refreshMasterKey: () => Promise<boolean>
  isEncryptionReady: boolean
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null)

interface EncryptionProviderProps {
  children: ReactNode
}

/**
 * Provider component for IndexedDB encryption
 * Wraps children with encryption context and handles initialization
 *
 * Encryption setup requires user interaction:
 * - First device: User must set a backup password (initializeEncryption)
 * - New devices: User must enter their backup password (unlockWithBackupPassword)
 */
export function EncryptionProvider({ children }: EncryptionProviderProps) {
  const {
    state,
    getMasterKey,
    initializeEncryption,
    unlockWithBackupPassword,
    rotateMasterKey,
    refreshMasterKey,
  } = useEncryption()

  const hasMigrated = useRef(false)

  // Initialize storage encryption when master key becomes available
  useEffect(() => {
    if (state.isInitialized && getMasterKey() !== null) {
      // Initialize storage modules with master key getter
      initializeEncryptedKeyStorage(getMasterKey)
      initializeEncryptedMessageStorage(getMasterKey)

      // Run migration if not already done
      if (!hasMigrated.current) {
        hasMigrated.current = true
        console.log('[EncryptionProvider] Running storage migration...')

        // Run migrations in parallel
        Promise.all([
          migrateKeysToEncrypted().catch((e) =>
            console.error('[EncryptionProvider] Key migration failed:', e)
          ),
          migrateMessagesToEncrypted().catch((e) =>
            console.error('[EncryptionProvider] Message migration failed:', e)
          ),
        ]).then(([keyCount, messageCount]) => {
          console.log(`[EncryptionProvider] Migration complete: ${keyCount || 0} keys, ${messageCount || 0} messages`)
        })
      }
    }
  }, [state.isInitialized, getMasterKey])

  // Listen for key rotation notifications from other devices
  useEffect(() => {
    if (!state.isInitialized) return

    const handleKeyRotated = async (event: Event) => {
      const customEvent = event as CustomEvent
      const { fromDeviceId, keyVersion } = customEvent.detail || {}
      console.log(`[EncryptionProvider] Key rotated on device ${fromDeviceId}, version: ${keyVersion}`)
      console.log('[EncryptionProvider] Refreshing master key...')

      const success = await refreshMasterKey()
      if (success) {
        console.log('[EncryptionProvider] Master key refreshed successfully after rotation notification')
      } else {
        console.error('[EncryptionProvider] Failed to refresh master key after rotation notification')
      }
    }

    window.addEventListener('key-rotated', handleKeyRotated)
    return () => {
      window.removeEventListener('key-rotated', handleKeyRotated)
    }
  }, [state.isInitialized, refreshMasterKey])

  // Listen for device revocation notifications
  useEffect(() => {
    const handleDeviceRevoked = async (event: Event) => {
      const customEvent = event as CustomEvent
      const { targetDeviceId, reason } = customEvent.detail || {}
      console.log(`[EncryptionProvider] This device has been revoked! Device: ${targetDeviceId}, Reason: ${reason}`)

      // Clear all local device data
      localStorage.removeItem('p2p4e_device_id')
      localStorage.removeItem('p2p4e_device_name')
      localStorage.removeItem('p2p4everything-device-id')

      // Clear IndexedDB encryption keys
      try {
        const databases = ['p2p4everything-keys', 'p2p4everything-messages']
        for (const dbName of databases) {
          const request = indexedDB.deleteDatabase(dbName)
          request.onerror = () => console.error(`[EncryptionProvider] Failed to delete ${dbName}`)
          request.onsuccess = () => console.log(`[EncryptionProvider] Deleted ${dbName}`)
        }
      } catch (error) {
        console.error('[EncryptionProvider] Error clearing IndexedDB:', error)
      }

      // Redirect to device-revoked info page
      window.location.href = '/device-revoked'
    }

    window.addEventListener('device-revoked', handleDeviceRevoked)
    return () => {
      window.removeEventListener('device-revoked', handleDeviceRevoked)
    }
  }, [])

  const isEncryptionReady = state.isInitialized && getMasterKey() !== null

  const value: EncryptionContextValue = {
    state,
    getMasterKey,
    initializeEncryption,
    unlockWithBackupPassword,
    rotateMasterKey,
    refreshMasterKey,
    isEncryptionReady,
  }

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  )
}

/**
 * Hook to access encryption context
 * Must be used within EncryptionProvider
 */
export function useEncryptionContext(): EncryptionContextValue {
  const context = useContext(EncryptionContext)
  if (!context) {
    throw new Error('useEncryptionContext must be used within EncryptionProvider')
  }
  return context
}

/**
 * Hook to check if encryption is available
 * Safe to call outside of EncryptionProvider (returns false)
 */
export function useIsEncryptionAvailable(): boolean {
  const context = useContext(EncryptionContext)
  return context?.isEncryptionReady ?? false
}
