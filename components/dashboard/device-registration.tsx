'use client'

import { useEffect, useState, useRef } from 'react'
import { useDeviceRegistration } from '@/hooks/useDeviceRegistration'

export function DeviceRegistration() {
  const { isRegistered, isRegistering, error, publicKeyFingerprint } =
    useDeviceRegistration()

  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const hasShownToast = useRef(false)

  // Show success toast once when device is registered
  useEffect(() => {
    if (isRegistered && publicKeyFingerprint && !hasShownToast.current) {
      hasShownToast.current = true
      setShowSuccessToast(true)

      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        setShowSuccessToast(false)
      }, 4000)

      return () => clearTimeout(timer)
    }
  }, [isRegistered, publicKeyFingerprint])

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
        <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
          Device Registration Failed
        </p>
        <p className="text-sm text-red-700 dark:text-red-300 mb-2">
          {error}
        </p>
        <button
          onClick={() => {
            // Clear registration flag and reload
            localStorage.removeItem('p2p4everything-device-registered')
            window.location.reload()
          }}
          className="text-xs text-red-600 dark:text-red-400 hover:underline"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Show success as a toast notification
  if (showSuccessToast && publicKeyFingerprint) {
    return (
      <div className="fixed top-20 right-4 z-50 animate-slide-in">
        <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg max-w-sm">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="font-semibold">Device Registered</p>
              <p className="text-sm opacity-90 mt-1">
                Key fingerprint: {publicKeyFingerprint.substring(0, 8)}...
              </p>
            </div>
            <button
              onClick={() => setShowSuccessToast(false)}
              className="ml-3 text-white opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

