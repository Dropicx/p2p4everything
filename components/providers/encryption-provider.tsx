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

  const isEncryptionReady = state.isInitialized && getMasterKey() !== null

  const value: EncryptionContextValue = {
    state,
    getMasterKey,
    initializeEncryption,
    unlockWithBackupPassword,
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
