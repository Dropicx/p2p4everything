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
    requestPermission,
    connectedDevices,
    isPasting,
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
            {/* How it works info */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <strong>How it works:</strong> When you copy or cut text (Ctrl/Cmd+C or Ctrl/Cmd+X),
                it will automatically sync to your other devices.
              </p>
            </div>

            {isPasting && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg animate-pulse">
                <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Receiving clipboard from another device...
                </p>
              </div>
            )}

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

            <div className="pt-2 space-y-2">
              <Button
                onClick={manualSync}
                variant="primary"
                className="w-full"
              >
                Sync Clipboard Now
              </Button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tip: Use the &quot;Sync Clipboard Now&quot; button to manually sync your current clipboard,
              or just copy/cut text normally and it will sync automatically.
            </p>
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


