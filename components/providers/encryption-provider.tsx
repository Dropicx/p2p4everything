'use client'

import { createContext, useContext, ReactNode, useEffect, useRef } from 'react'
import { useEncryption, EncryptionState } from '@/hooks/useEncryption'
import { initializeEncryptedKeyStorage, migrateKeysToEncrypted } from '@/lib/crypto/storage'
import { initializeEncryptedMessageStorage, migrateMessagesToEncrypted } from '@/lib/crypto/message-storage'

interface EncryptionContextValue {
  state: EncryptionState
  getMasterKey: () => CryptoKey | null
  initializeEncryption: () => Promise<boolean>
  isEncryptionReady: boolean
}

const EncryptionContext = createContext<EncryptionContextValue | null>(null)

interface EncryptionProviderProps {
  children: ReactNode
}

/**
 * Provider component for IndexedDB encryption
 * Wraps children with encryption context and handles initialization
 */
export function EncryptionProvider({ children }: EncryptionProviderProps) {
  const {
    state,
    getMasterKey,
    initializeEncryption,
  } = useEncryption()

  // Track if we're the first device and need to initialize
  const hasAttemptedAutoInit = useRef(false)
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

  // Auto-initialize for first device when setup is required
  useEffect(() => {
    if (state.requiresSetup && !state.isLoading && !hasAttemptedAutoInit.current) {
      hasAttemptedAutoInit.current = true

      // Retry initialization with exponential backoff
      // Device registration may still be in progress
      const attemptInit = async (attempt: number = 1, maxAttempts: number = 5) => {
        console.log(`[EncryptionProvider] First device detected, initializing encryption (attempt ${attempt})...`)
        const success = await initializeEncryption()

        if (!success && attempt < maxAttempts) {
          // Wait longer between each attempt (1s, 2s, 3s, 4s)
          const delay = attempt * 1000
          console.log(`[EncryptionProvider] Initialization failed, retrying in ${delay}ms...`)
          setTimeout(() => attemptInit(attempt + 1, maxAttempts), delay)
        }
      }

      // Initial delay to let device registration start
      setTimeout(() => attemptInit(), 1000)
    }
  }, [state.requiresSetup, state.isLoading, initializeEncryption])

  // Reset auto-init flag when state changes
  useEffect(() => {
    if (state.isInitialized) {
      hasAttemptedAutoInit.current = false
    }
  }, [state.isInitialized])

  const isEncryptionReady = state.isInitialized && getMasterKey() !== null

  const value: EncryptionContextValue = {
    state,
    getMasterKey,
    initializeEncryption,
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
