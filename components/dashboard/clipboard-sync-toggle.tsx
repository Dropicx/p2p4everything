'use client'

import { useClipboardSync } from '@/hooks/useClipboardSync'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function ClipboardSyncToggle() {
  const {
    enabled,
    setEnabled,
    permissionStatus,
    isSupported,
    lastSyncTime,
    syncError,
    manualSync,
    connectedDevices,
  } = useClipboardSync()

  if (!isSupported) {
    return (
      <Card title="Clipboard Sync">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Clipboard sync is not supported in this browser or requires a secure connection (HTTPS).
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Clipboard Sync">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Enable Clipboard Sync
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Automatically sync clipboard text across your devices
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {enabled && (
          <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Permission Status:</span>
              <span
                className={`font-medium ${
                  permissionStatus === 'granted'
                    ? 'text-green-600 dark:text-green-400'
                    : permissionStatus === 'denied'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                }`}
              >
                {permissionStatus === 'granted'
                  ? 'Granted'
                  : permissionStatus === 'denied'
                  ? 'Denied'
                  : permissionStatus === 'prompt'
                  ? 'Prompt'
                  : 'Unknown'}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Connected Devices:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {connectedDevices}
              </span>
            </div>

            {lastSyncTime && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Last Sync:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {new Date(lastSyncTime).toLocaleTimeString()}
                </span>
              </div>
            )}

            {syncError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{syncError}</p>
              </div>
            )}

            <div className="pt-2">
              <Button
                onClick={manualSync}
                disabled={permissionStatus === 'denied'}
                className="w-full"
              >
                Sync Clipboard Now
              </Button>
            </div>

            {permissionStatus === 'denied' && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Please grant clipboard access in your browser settings to enable sync.
              </p>
            )}
          </div>
        )}

        {!enabled && (
          <p className="text-sm text-gray-500 dark:text-gray-400 pt-2">
            When enabled, clipboard changes will automatically sync to all your other devices.
          </p>
        )}
      </div>
    </Card>
  )
}


