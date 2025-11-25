'use client'

import { useState } from 'react'
import { useEncryptionContext } from '@/components/providers/encryption-provider'

/**
 * Encryption setup component
 * Shows appropriate UI based on encryption state:
 * - First device: Form to create backup password
 * - New device: Form to enter existing backup password
 */
export function EncryptionSetup() {
  const { state, initializeEncryption, unlockWithBackupPassword } = useEncryptionContext()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  // Don't show anything if encryption is ready or still loading
  if (state.isInitialized || state.isLoading) {
    return null
  }

  // Don't show if neither setup nor backup password is required
  if (!state.requiresSetup && !state.requiresBackupPassword) {
    return null
  }

  const isFirstDevice = state.requiresSetup
  const isNewDevice = state.requiresBackupPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (isFirstDevice) {
      // Validate password for first device setup
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters')
        return
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match')
        return
      }

      const success = await initializeEncryption(password)
      if (!success && !state.error) {
        setLocalError('Failed to initialize encryption')
      }
    } else if (isNewDevice) {
      // Just need the password for new device
      if (!password) {
        setLocalError('Please enter your backup password')
        return
      }

      const success = await unlockWithBackupPassword(password)
      if (!success && !state.error) {
        setLocalError('Failed to unlock encryption')
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {isFirstDevice ? 'Set Up Encryption' : 'Unlock Encryption'}
          </h2>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {isFirstDevice
              ? 'Create a backup password to protect your encrypted data. You will need this password when signing in on new devices.'
              : 'Enter your backup password to unlock encryption on this device.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {isFirstDevice ? 'Backup Password' : 'Backup Password'}
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              placeholder={isFirstDevice ? 'Create a strong password' : 'Enter your backup password'}
              autoFocus
              minLength={isFirstDevice ? 8 : 1}
            />
          </div>

          {isFirstDevice && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Confirm your password"
                minLength={8}
              />
            </div>
          )}

          {(localError || state.error) && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">
                {localError || state.error}
              </p>
            </div>
          )}

          {isFirstDevice && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                <strong>Important:</strong> Store this password securely. If you forget it, you will not be able to access your encrypted messages on new devices.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={state.isLoading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
          >
            {state.isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {isFirstDevice ? 'Setting up...' : 'Unlocking...'}
              </>
            ) : (
              isFirstDevice ? 'Set Up Encryption' : 'Unlock'
            )}
          </button>
        </form>

        {isNewDevice && (
          <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
            This is the password you created when you first set up encryption on another device.
          </p>
        )}
      </div>
    </div>
  )
}
