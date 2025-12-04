'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useEncryption } from '@/hooks/useEncryption'

interface Device {
  id: string
  deviceName: string
  deviceType: string
  createdAt: string
  lastSeen: string
  revokedAt?: string | null
}

interface DevicesPageClientProps {
  devices: Device[]
}

/**
 * Format a date as relative time (e.g., "2 minutes ago", "1 hour ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return 'Just now'
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`
  }

  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`
  }

  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`
  }

  // For older dates, show the actual date
  return date.toLocaleDateString()
}

/**
 * Get a display-friendly device type
 */
function formatDeviceType(deviceType: string): string {
  switch (deviceType) {
    case 'web':
      return 'Web Browser'
    case 'mobile':
      return 'Mobile'
    case 'desktop':
      return 'Desktop App'
    default:
      return deviceType
  }
}

export default function DevicesPageClient({ devices }: DevicesPageClientProps) {
  const { rotateMasterKey } = useEncryption()
  const [deviceList, setDeviceList] = useState(devices)
  const [, setTick] = useState(0) // Force re-render for relative time updates
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showRevokeDialog, setShowRevokeDialog] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

  // Get current device ID from localStorage
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null)
  useEffect(() => {
    const storedDeviceId = localStorage.getItem('p2p4e_device_id')
    setCurrentDeviceId(storedDeviceId)
  }, [])

  // Key rotation state
  const [showRotationDialog, setShowRotationDialog] = useState(false)
  const [rotationLogId, setRotationLogId] = useState<string | null>(null)
  const [rotationPassword, setRotationPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rotationInProgress, setRotationInProgress] = useState(false)
  const [rotationProgress, setRotationProgress] = useState(0)
  const [rotationError, setRotationError] = useState<string | null>(null)
  const [rotationComplete, setRotationComplete] = useState(false)

  // Fetch fresh device data from the server
  const refreshDevices = useCallback(async () => {
    try {
      const response = await fetch('/api/devices')
      if (response.ok) {
        const freshDevices = await response.json()
        setDeviceList(freshDevices.map((d: any) => ({
          id: d.id,
          deviceName: d.deviceName,
          deviceType: d.deviceType,
          createdAt: d.createdAt,
          lastSeen: d.lastSeen,
          revokedAt: d.revokedAt ?? null,
        })))
      }
    } catch (error) {
      console.error('Failed to refresh devices:', error)
    }
  }, [])

  // Poll for device updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(refreshDevices, 30000)
    return () => clearInterval(interval)
  }, [refreshDevices])

  // Update relative times every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const handleRevoke = async (deviceId: string) => {
    setDeleting(deviceId)
    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: revokeReason || 'Device revoked by user',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setDeviceList(deviceList.filter((d) => d.id !== deviceId))
        setShowRevokeDialog(null)
        setRevokeReason('')

        // If rotation is required, show inline key rotation dialog
        if (data.rotationRequired) {
          setRotationLogId(data.rotationLogId)
          setShowRotationDialog(true)
        }
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to revoke device')
      }
    } catch (error) {
      console.error('Error revoking device:', error)
      alert('Failed to revoke device')
    } finally {
      setDeleting(null)
    }
  }

  const handleRotation = async () => {
    if (!rotationPassword.trim()) {
      setRotationError('Please enter your backup password')
      return
    }

    setRotationInProgress(true)
    setRotationProgress(0)
    setRotationError(null)

    try {
      const success = await rotateMasterKey(
        rotationPassword,
        undefined,
        (progress) => setRotationProgress(progress),
        rotationLogId || undefined
      )

      if (success) {
        setRotationComplete(true)
      } else {
        setRotationError('Key rotation failed. Please check your password and try again.')
      }
    } catch (error) {
      setRotationError(error instanceof Error ? error.message : 'Key rotation failed')
    } finally {
      setRotationInProgress(false)
    }
  }

  const closeRotationDialog = () => {
    setShowRotationDialog(false)
    setRotationLogId(null)
    setRotationPassword('')
    setRotationError(null)
    setRotationComplete(false)
    setRotationProgress(0)
  }

  const activeDevices = deviceList.filter((d) => !d.revokedAt)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Devices
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your registered devices
        </p>
      </div>

      <Card>
        {activeDevices.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No devices registered yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Devices will be automatically registered when you connect from a
              new device
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeDevices.length > 1 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  You have {activeDevices.length} devices. Enable{' '}
                  <Link href="/dashboard/settings" className="underline font-medium">
                    clipboard sync
                  </Link>{' '}
                  to automatically share clipboard text across all your devices.
                </p>
              </div>
            )}
            {activeDevices.map((device) => {
              const isCurrentDevice = device.id === currentDeviceId
              const isOnlyDevice = activeDevices.length === 1
              return (
                <div
                  key={device.id}
                  className={`flex justify-between items-center p-4 border rounded-lg ${
                    isCurrentDevice
                      ? 'border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      {device.deviceName}
                      {isCurrentDevice && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDeviceType(device.deviceType)} • Registered{' '}
                      {formatRelativeTime(device.createdAt)} • Last seen{' '}
                      {formatRelativeTime(device.lastSeen)}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => setShowRevokeDialog(device.id)}
                    disabled={deleting === device.id || isOnlyDevice}
                    className="ml-4"
                    title={isOnlyDevice ? 'Cannot revoke your only device' : undefined}
                  >
                    {deleting === device.id ? 'Revoking...' : 'Revoke'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Revocation Dialog */}
      {showRevokeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Revoke Device
            </h3>

            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">
                    Important: Key Rotation Required
                  </p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
                    Revoking a device will automatically trigger encryption key rotation.
                    This ensures the revoked device cannot access any future data.
                    You will need to enter your backup password to complete this process.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Device: <span className="font-medium text-gray-900 dark:text-white">
                  {activeDevices.find((d) => d.id === showRevokeDialog)?.deviceName}
                </span>
              </p>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g., Lost device, sold device, etc."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRevokeDialog(null)
                  setRevokeReason('')
                }}
                disabled={deleting !== null}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRevoke(showRevokeDialog)}
                disabled={deleting !== null}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Revoking...' : 'Revoke Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Rotation Dialog - Non-dismissable */}
      {showRotationDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Complete Key Rotation
            </h3>

            {!rotationComplete ? (
              <>
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <div>
                      <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">
                        Security: Key Rotation Required
                      </p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
                        Your encryption keys are being rotated to ensure the revoked device can no longer access your data.
                        Enter your backup password to complete this process.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Backup Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={rotationPassword}
                      onChange={(e) => setRotationPassword(e.target.value)}
                      disabled={rotationInProgress}
                      placeholder="Enter your backup password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !rotationInProgress) {
                          handleRotation()
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={rotationInProgress}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {rotationInProgress && (
                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                      <span>Rotating keys...</span>
                      <span>{rotationProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${rotationProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {rotationError && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-700 dark:text-red-400">{rotationError}</p>
                  </div>
                )}

                <button
                  onClick={handleRotation}
                  disabled={rotationInProgress || !rotationPassword.trim()}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rotationInProgress ? 'Rotating Keys...' : 'Rotate Keys'}
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                        Key Rotation Complete
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                        Your encryption keys have been successfully rotated. The revoked device can no longer access your data.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={closeRotationDialog}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

