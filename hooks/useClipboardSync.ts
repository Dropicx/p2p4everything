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
  connectedDevices: number
}

const CLIPBOARD_SYNC_ENABLED_KEY = 'p2p4everything-clipboard-sync-enabled'
const CLIPBOARD_CHECK_INTERVAL = 1000 // Check clipboard every second

export function useClipboardSync(): UseClipboardSyncReturn {
  const { client, isReady } = useWebRTC()
  const [enabled, setEnabledState] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [connectedDevices, setConnectedDevices] = useState(0)

  const lastClipboardValue = useRef<string>('')
  const clipboardCheckInterval = useRef<NodeJS.Timeout | null>(null)
  const currentDeviceId = useRef<string | null>(null)
  const devicesRef = useRef<Device[]>([])

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
          setPermissionStatus(result.state)
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

  // Monitor clipboard changes
  useEffect(() => {
    if (!enabled || !isSupported || !isReady || !client) {
      if (clipboardCheckInterval.current) {
        clearInterval(clipboardCheckInterval.current)
        clipboardCheckInterval.current = null
      }
      return
    }

    // Check clipboard periodically
    clipboardCheckInterval.current = setInterval(async () => {
      try {
        // Check permission
        if (permissionStatus === 'denied') {
          setSyncError('Clipboard permission denied')
          return
        }

        const clipboardText = await navigator.clipboard.readText()
        
        // Only send if clipboard changed
        if (clipboardText !== lastClipboardValue.current && clipboardText.trim().length > 0) {
          lastClipboardValue.current = clipboardText
          await sendClipboardToDevices(clipboardText)
        }
      } catch (error: any) {
        // Handle permission errors gracefully
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
          setPermissionStatus('denied')
          setSyncError('Clipboard permission denied. Please grant clipboard access.')
        } else {
          // Other errors (e.g., clipboard empty) are not critical
          console.debug('[Clipboard Sync] Clipboard read error (non-critical):', error)
        }
      }
    }, CLIPBOARD_CHECK_INTERVAL)

    return () => {
      if (clipboardCheckInterval.current) {
        clearInterval(clipboardCheckInterval.current)
        clipboardCheckInterval.current = null
      }
    }
  }, [enabled, isSupported, isReady, client, permissionStatus, sendClipboardToDevices])

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

      try {
        setSyncError(null)
        
        // Get current device's private key
        const storedKeyPair = await getKeyPair(currentDeviceId.current!)
        if (!storedKeyPair) {
          throw new Error('No key pair found for current device')
        }

        const keyPair = await importKeyPair(storedKeyPair)
        
        // Decrypt clipboard data
        const clipboardText = await decryptMessage(encryptedData, keyPair.privateKey, currentDeviceId.current!)
        
        // Write to clipboard
        await navigator.clipboard.writeText(clipboardText)
        lastClipboardValue.current = clipboardText
        setLastSyncTime(Date.now())
        
        console.log(`[Clipboard Sync] Received and applied clipboard from device ${fromDeviceId}`)
      } catch (error) {
        console.error('[Clipboard Sync] Error processing incoming clipboard sync:', error)
        setSyncError('Failed to process clipboard sync')
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
  }, [client, isReady])

  // Manual sync function
  const manualSync = useCallback(async () => {
    if (!isSupported) {
      setSyncError('Clipboard API not supported')
      return
    }

    try {
      setSyncError(null)
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText.trim().length > 0) {
        lastClipboardValue.current = clipboardText
        await sendClipboardToDevices(clipboardText)
      } else {
        setSyncError('Clipboard is empty')
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        setPermissionStatus('denied')
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
    connectedDevices,
  }
}

