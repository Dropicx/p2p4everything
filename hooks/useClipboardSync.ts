'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useWebRTC } from './useWebRTC'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { importPublicKey, importKeyPair } from '@/lib/crypto/keys'
import { getKeyPair } from '@/lib/crypto/storage'

interface Device {
  id: string
  deviceName: string
  deviceType: string
  publicKey: string
}

export interface UseClipboardSyncReturn {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  permissionStatus: PermissionState | null
  isSupported: boolean
  lastSyncTime: number | null
  syncError: string | null
  manualSync: () => Promise<void>
  requestPermission: () => Promise<boolean>
  connectedDevices: number
  isPasting: boolean
}

const CLIPBOARD_SYNC_ENABLED_KEY = 'p2p4everything-clipboard-sync-enabled'

export function useClipboardSync(): UseClipboardSyncReturn {
  const { client, isReady } = useWebRTC()
  const [enabled, setEnabledState] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [connectedDevices, setConnectedDevices] = useState(0)
  const [isPasting, setIsPasting] = useState(false)

  const lastClipboardValue = useRef<string>('')
  const currentDeviceId = useRef<string | null>(null)
  const devicesRef = useRef<Device[]>([])
  const isReceivingSync = useRef(false) // Flag to prevent echo when receiving sync

  // Check if clipboard API is supported
  useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      'clipboard' in navigator &&
      'readText' in navigator.clipboard &&
      'writeText' in navigator.clipboard &&
      window.isSecureContext // Clipboard API requires secure context (HTTPS)

    setIsSupported(supported)

    if (supported) {
      // Check permission status
      navigator.permissions.query({ name: 'clipboard-read' as PermissionName }).then((result) => {
        setPermissionStatus(result.state)
        result.onchange = () => {
          console.log('[Clipboard Sync] Permission changed to:', result.state)
          setPermissionStatus(result.state)
          // Clear error when permission changes to granted
          if (result.state === 'granted') {
            setSyncError(null)
          }
        }
      }).catch(() => {
        // Permission API might not be available, but clipboard API might still work
        setPermissionStatus('prompt')
      })
    }
  }, [])

  // Load enabled state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(CLIPBOARD_SYNC_ENABLED_KEY)
    if (stored === 'true') {
      setEnabledState(true)
    }
  }, [])

  // Get current device ID
  useEffect(() => {
    currentDeviceId.current = localStorage.getItem('p2p4everything-device-id')
  }, [])

  // Fetch user's devices
  const fetchDevices = useCallback(async (): Promise<Device[]> => {
    try {
      const response = await fetch('/api/devices')
      if (!response.ok) {
        throw new Error('Failed to fetch devices')
      }
      const devices = await response.json()
      devicesRef.current = devices
      setConnectedDevices(devices.length)
      return devices
    } catch (error) {
      console.error('[Clipboard Sync] Error fetching devices:', error)
      setSyncError('Failed to fetch devices')
      return []
    }
  }, [])

  // Send clipboard to other devices
  const sendClipboardToDevices = useCallback(async (clipboardText: string) => {
    if (!client || !isReady || !currentDeviceId.current) {
      console.warn('[Clipboard Sync] Cannot send: client not ready or device ID missing')
      return
    }

    try {
      setSyncError(null)
      const devices = await fetchDevices()
      
      // Filter out current device
      const otherDevices = devices.filter(d => d.id !== currentDeviceId.current)
      
      if (otherDevices.length === 0) {
        console.log('[Clipboard Sync] No other devices to sync to')
        return
      }

      // Encrypt for each device and send
      let sentCount = 0
      for (const device of otherDevices) {
        if (!device.publicKey) {
          console.warn(`[Clipboard Sync] Device ${device.deviceName} has no public key, skipping`)
          continue
        }

        try {
          const publicKey = await importPublicKey(device.publicKey)
          const encryptedData = await encryptMessage(clipboardText, publicKey)
          
          // Send via WebRTC client
          client.sendClipboardSync(encryptedData, device.id)
          sentCount++
        } catch (error) {
          console.error(`[Clipboard Sync] Error encrypting for device ${device.deviceName}:`, error)
        }
      }

      if (sentCount > 0) {
        setLastSyncTime(Date.now())
        console.log(`[Clipboard Sync] Sent clipboard to ${sentCount} device(s)`)
      }
    } catch (error) {
      console.error('[Clipboard Sync] Error sending clipboard:', error)
      setSyncError('Failed to sync clipboard')
    }
  }, [client, isReady, fetchDevices])

  // Monitor clipboard changes using copy/cut events
  // This approach works reliably because it's triggered by user gestures
  useEffect(() => {
    if (!enabled || !isSupported || !isReady || !client) {
      return
    }

    const handleCopyOrCut = async (event: ClipboardEvent) => {
      // Skip if we're currently receiving a sync (to prevent echo)
      if (isReceivingSync.current) {
        console.log('[Clipboard Sync] Skipping copy event - currently receiving sync')
        return
      }

      try {
        // Get the copied/cut text from the event
        let clipboardText = event.clipboardData?.getData('text/plain')

        // If not available from event, try to read from clipboard
        // (this works because we're in a user gesture context)
        if (!clipboardText) {
          // Small delay to let the clipboard update
          await new Promise(resolve => setTimeout(resolve, 50))
          try {
            clipboardText = await navigator.clipboard.readText()
          } catch (e) {
            console.log('[Clipboard Sync] Could not read clipboard after copy:', e)
            return
          }
        }

        if (clipboardText && clipboardText.trim().length > 0 && clipboardText !== lastClipboardValue.current) {
          console.log('[Clipboard Sync] Copy/cut detected, syncing clipboard...')
          lastClipboardValue.current = clipboardText
          setSyncError(null)
          await sendClipboardToDevices(clipboardText)
        }
      } catch (error) {
        console.error('[Clipboard Sync] Error handling copy/cut event:', error)
      }
    }

    // Listen for copy and cut events on the document
    document.addEventListener('copy', handleCopyOrCut)
    document.addEventListener('cut', handleCopyOrCut)

    console.log('[Clipboard Sync] Event listeners attached for copy/cut')

    return () => {
      document.removeEventListener('copy', handleCopyOrCut)
      document.removeEventListener('cut', handleCopyOrCut)
      console.log('[Clipboard Sync] Event listeners removed')
    }
  }, [enabled, isSupported, isReady, client, sendClipboardToDevices])

  // Listen for incoming clipboard sync messages
  useEffect(() => {
    if (!client || !isReady || !currentDeviceId.current) {
      return
    }

    // Set up clipboard sync handler
    const handleClipboardSync = async (
      encryptedData: string,
      fromDeviceId: string,
      fromUserId: string
    ) => {
      // Don't process if it came from this device
      if (fromDeviceId === currentDeviceId.current) {
        return
      }

      // Don't process if clipboard sync is not enabled
      if (!enabled) {
        console.log('[Clipboard Sync] Ignoring incoming sync - feature is disabled')
        return
      }

      try {
        setSyncError(null)
        setIsPasting(true)
        isReceivingSync.current = true

        // Get current device's private key
        const storedKeyPair = await getKeyPair(currentDeviceId.current!)
        if (!storedKeyPair) {
          throw new Error('No key pair found for current device')
        }

        const keyPair = await importKeyPair(storedKeyPair)

        // Decrypt clipboard data
        const clipboardText = await decryptMessage(encryptedData, keyPair.privateKey, currentDeviceId.current!)

        // Write to clipboard - this requires user gesture in some browsers
        // but we'll try anyway since user enabled the feature
        try {
          await navigator.clipboard.writeText(clipboardText)
          lastClipboardValue.current = clipboardText
          setLastSyncTime(Date.now())
          console.log(`[Clipboard Sync] Received and applied clipboard from device ${fromDeviceId}`)
        } catch (writeError: any) {
          // If write fails due to permissions, show a notification instead
          console.warn('[Clipboard Sync] Could not write to clipboard:', writeError)
          setSyncError(`Clipboard received but could not auto-paste. Text: "${clipboardText.substring(0, 50)}${clipboardText.length > 50 ? '...' : ''}"`)
        }
      } catch (error) {
        console.error('[Clipboard Sync] Error processing incoming clipboard sync:', error)
        setSyncError('Failed to process clipboard sync')
      } finally {
        setIsPasting(false)
        // Keep the flag true for a short time to prevent copy event from triggering
        setTimeout(() => {
          isReceivingSync.current = false
        }, 500)
      }
    }

    // Listen for clipboard sync messages via signaling
    const unsubscribe = client.signaling.onMessage('clipboard-sync', (message) => {
      if (message.type === 'clipboard-sync') {
        handleClipboardSync(
          message.encryptedData,
          message.fromDeviceId,
          message.fromUserId
        )
      }
    })

    return unsubscribe
  }, [client, isReady, enabled])

  // Request clipboard permission explicitly
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setSyncError('Clipboard API not supported')
      return false
    }

    try {
      setSyncError(null)
      // Trigger permission prompt by attempting to read clipboard
      // This is the standard way to request clipboard permission
      await navigator.clipboard.readText()

      // If we get here, permission was granted
      setPermissionStatus('granted')
      setSyncError(null)
      console.log('[Clipboard Sync] Permission granted')
      return true
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        // Check actual permission state - it might be 'prompt' if user dismissed
        try {
          const result = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName })
          setPermissionStatus(result.state)
          if (result.state === 'denied') {
            setSyncError('Clipboard permission denied. Please enable it in browser settings.')
          } else if (result.state === 'prompt') {
            setSyncError('Permission dismissed. Please try again and click Allow.')
          }
        } catch {
          setPermissionStatus('denied')
          setSyncError('Clipboard permission denied')
        }
        return false
      } else {
        // Other error (e.g., empty clipboard) - permission might still be ok
        console.log('[Clipboard Sync] Read error but permission may be ok:', error.message)
        return true
      }
    }
  }, [isSupported])

  // Manual sync function
  const manualSync = useCallback(async () => {
    if (!isSupported) {
      setSyncError('Clipboard API not supported')
      return
    }

    try {
      setSyncError(null)
      const clipboardText = await navigator.clipboard.readText()

      // Update permission status on success
      setPermissionStatus('granted')

      if (clipboardText.trim().length > 0) {
        lastClipboardValue.current = clipboardText
        await sendClipboardToDevices(clipboardText)
      } else {
        setSyncError('Clipboard is empty')
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        // Re-check permission status
        try {
          const result = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName })
          setPermissionStatus(result.state)
        } catch {
          setPermissionStatus('denied')
        }
        setSyncError('Clipboard permission denied')
      } else {
        setSyncError('Failed to read clipboard')
      }
    }
  }, [isSupported, sendClipboardToDevices])

  // Set enabled state (with localStorage persistence)
  const setEnabled = useCallback((newEnabled: boolean) => {
    setEnabledState(newEnabled)
    localStorage.setItem(CLIPBOARD_SYNC_ENABLED_KEY, newEnabled ? 'true' : 'false')
    
    if (!newEnabled) {
      // Clear error when disabling
      setSyncError(null)
    }
  }, [])

  return {
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
  }
}

