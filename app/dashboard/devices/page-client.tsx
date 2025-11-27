'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

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

export default function DevicesPageClient({ devices }: DevicesPageClientProps) {
  const router = useRouter()
  const [deviceList, setDeviceList] = useState(devices)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showRevokeDialog, setShowRevokeDialog] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')

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

        // If rotation is required, redirect to settings page
        if (data.rotationRequired) {
          // Show alert about key rotation
          alert(
            'Device revoked successfully. You will now be redirected to complete key rotation. ' +
            'Please enter your backup password to secure your data.'
          )
          router.push('/dashboard/settings')
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
            {activeDevices.map((device) => (
              <div
                key={device.id}
                className="flex justify-between items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {device.deviceName}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Type: {device.deviceType} • Registered:{' '}
                    {new Date(device.createdAt).toLocaleDateString()} • Last
                    seen: {new Date(device.lastSeen).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => setShowRevokeDialog(device.id)}
                  disabled={deleting === device.id}
                  className="ml-4"
                >
                  {deleting === device.id ? 'Revoking...' : 'Revoke'}
                </Button>
              </div>
            ))}
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
    </div>
  )
}

