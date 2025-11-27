'use client'

import { useState, useEffect } from 'react'
import { useEncryptionContext } from '@/components/providers/encryption-provider'

interface RotationStatus {
  currentVersion: number
  lastRotation: string | null
  pendingRotation: {
    id: string
    status: string
    oldVersion: number
    newVersion: number
    triggeredBy: string
    startedAt: string
  } | null
}

export function KeyRotation() {
  const { getMasterKey, rotateMasterKey, state } = useEncryptionContext()
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [changePassword, setChangePassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [rotationStatus, setRotationStatus] = useState<RotationStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // Fetch rotation status on mount
  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/users/encryption-key/rotate')
        if (response.ok) {
          const data = await response.json()
          setRotationStatus(data)
        }
      } catch (err) {
        console.error('Failed to fetch rotation status:', err)
      } finally {
        setLoadingStatus(false)
      }
    }
    fetchStatus()
  }, [success]) // Re-fetch after successful rotation

  const handleRotate = async () => {
    setError(null)

    if (!password) {
      setError('Please enter your backup password')
      return
    }

    if (changePassword) {
      if (!newPassword || !confirmNewPassword) {
        setError('Please enter and confirm your new password')
        return
      }
      if (newPassword !== confirmNewPassword) {
        setError('New passwords do not match')
        return
      }
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters')
        return
      }
    }

    const success = await rotateMasterKey(
      password,
      changePassword ? newPassword : undefined,
      (progress) => {
        // Progress is tracked via state.rotationProgress
      }
    )

    if (success) {
      setSuccess(true)
      setShowPasswordDialog(false)
      setPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setChangePassword(false)

      // Reset success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000)
    } else {
      setError(state.error || 'Key rotation failed')
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const masterKey = getMasterKey()
  const isEncryptionReady = masterKey !== null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Encryption Key Rotation
      </h2>

      {/* Status */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Key Version:</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {loadingStatus ? '...' : `v${rotationStatus?.currentVersion ?? 1}`}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Last Rotated:</span>
          <span className="text-gray-900 dark:text-white">
            {loadingStatus ? '...' : formatDate(rotationStatus?.lastRotation ?? null)}
          </span>
        </div>

        {rotationStatus?.pendingRotation && (
          <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium">Pending Key Rotation</span>
            </div>
            <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-500">
              Triggered by: {rotationStatus.pendingRotation.triggeredBy}
            </p>
            <p className="text-sm text-yellow-600 dark:text-yellow-500">
              v{rotationStatus.pendingRotation.oldVersion} → v{rotationStatus.pendingRotation.newVersion}
            </p>
          </div>
        )}
      </div>

      {/* Success message */}
      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Encryption key rotated successfully!</span>
          </div>
        </div>
      )}

      {/* Rotation in progress */}
      {state.isRotating && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-700 dark:text-gray-300">Rotating encryption key...</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${state.rotationProgress}%` }}
            ></div>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {state.rotationProgress}% complete
          </p>
        </div>
      )}

      {/* Info box */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Why rotate your encryption key?
        </h3>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
          <li>Limits damage if a key is ever compromised</li>
          <li>Ensures revoked devices cannot access new data</li>
          <li>Recommended every 90 days for best security</li>
        </ul>
      </div>

      {/* Rotate button */}
      <button
        onClick={() => setShowPasswordDialog(true)}
        disabled={!isEncryptionReady || state.isRotating}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state.isRotating ? 'Rotating...' : 'Rotate Encryption Key'}
      </button>

      {!isEncryptionReady && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">
          Encryption must be initialized before rotating keys
        </p>
      )}

      {/* Password dialog */}
      {showPasswordDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Confirm Key Rotation
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter your backup password to rotate your encryption key. This will re-encrypt all your data with a new key.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Backup Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your backup password"
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="change-password"
                  checked={changePassword}
                  onChange={(e) => setChangePassword(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <label htmlFor="change-password" className="text-sm text-gray-700 dark:text-gray-300">
                  Also change backup password
                </label>
              </div>

              {changePassword && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Backup Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter new password (min 8 characters)"
                      autoComplete="new-password"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowPasswordDialog(false)
                  setPassword('')
                  setNewPassword('')
                  setConfirmNewPassword('')
                  setChangePassword(false)
                  setError(null)
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRotate}
                disabled={!password || state.isRotating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {state.isRotating ? 'Rotating...' : 'Rotate Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
