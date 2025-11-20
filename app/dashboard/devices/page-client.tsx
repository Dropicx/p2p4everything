'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Device {
  id: string
  deviceName: string
  deviceType: string
  createdAt: string
  lastSeen: string
}

interface DevicesPageClientProps {
  devices: Device[]
}

export default function DevicesPageClient({ devices }: DevicesPageClientProps) {
  const [deviceList, setDeviceList] = useState(devices)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (deviceId: string) => {
    if (!confirm('Are you sure you want to revoke this device?')) {
      return
    }

    setDeleting(deviceId)
    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setDeviceList(deviceList.filter((d) => d.id !== deviceId))
      } else {
        alert('Failed to revoke device')
      }
    } catch (error) {
      console.error('Error deleting device:', error)
      alert('Failed to revoke device')
    } finally {
      setDeleting(null)
    }
  }

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
        {deviceList.length === 0 ? (
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
            {deviceList.map((device) => (
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
                  onClick={() => handleDelete(device.id)}
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
    </div>
  )
}

