'use client'

import { useEffect, useState } from 'react'
import { useDeviceRegistration } from '@/hooks/useDeviceRegistration'

export function KeyFingerprint() {
  const { publicKeyFingerprint, isRegistered } = useDeviceRegistration()
  const [fullFingerprint, setFullFingerprint] = useState<string | null>(null)

  useEffect(() => {
    if (publicKeyFingerprint) {
      // Format fingerprint with colons for readability
      const formatted = publicKeyFingerprint
        .match(/.{1,2}/g)
        ?.join(':')
        .toUpperCase()
      setFullFingerprint(formatted || null)
    }
  }, [publicKeyFingerprint])

  if (!isRegistered || !fullFingerprint) {
    return null
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Encryption Key Fingerprint
      </label>
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
          {fullFingerprint}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(fullFingerprint)
          }}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Copy
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        This is your device&apos;s public key fingerprint. Share it with others to verify your identity.
      </p>
    </div>
  )
}

