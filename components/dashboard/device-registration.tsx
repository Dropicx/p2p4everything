'use client'

import { useDeviceRegistration } from '@/hooks/useDeviceRegistration'

export function DeviceRegistration() {
  const { isRegistered, isRegistering, error, publicKeyFingerprint } =
    useDeviceRegistration()

  if (isRegistering) {
    return (
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Registering device and generating encryption keys...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-700 dark:text-red-300">
          Device registration error: {error}
        </p>
      </div>
    )
  }

  if (isRegistered && publicKeyFingerprint) {
    return (
      <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <p className="text-sm text-green-700 dark:text-green-300">
          Device registered • Key fingerprint: {publicKeyFingerprint.substring(0, 8)}...
        </p>
      </div>
    )
  }

  return null
}

