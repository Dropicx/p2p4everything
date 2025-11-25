'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useWebRTC } from '@/hooks/useWebRTC'
import { encryptMessage, decryptMessage } from '@/lib/crypto/encryption'
import { importPublicKey, importKeyPair } from '@/lib/crypto/keys'
import { getKeyPair } from '@/lib/crypto/storage'

interface Device {
  id: string
  deviceName: string
  deviceType: string
  publicKey: string
}

export function QuickClipboard() {
  const { client, isReady } = useWebRTC()
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [lastReceived, setLastReceived] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'sent' | 'received' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [deviceCount, setDeviceCount] = useState(0)

  const currentDeviceId = typeof window !== 'undefined'
    ? localStorage.getItem('p2p4everything-device-id')
    : null

  // Fetch device count
  useEffect(() => {
    async function fetchDevices() {
      try {
        const response = await fetch('/api/devices')
        if (response.ok) {
          const devices = await response.json()
          // Count other devices (excluding current)
          const otherDevices = devices.filter((d: Device) => d.id !== currentDeviceId)
          setDeviceCount(otherDevices.length)
        }
      } catch (error) {
        console.error('[QuickClipboard] Error fetching devices:', error)
      }
    }

    fetchDevices()
  }, [currentDeviceId])

  // Listen for incoming clipboard data
  useEffect(() => {
    if (!client || !isReady || !currentDeviceId) {
      return
    }

    const handleClipboardSync = async (
      encryptedData: string,
      fromDeviceId: string,
      fromUserId: string
    ) => {
      if (fromDeviceId === currentDeviceId) {
        return
      }

      try {
        const storedKeyPair = await getKeyPair(currentDeviceId)
        if (!storedKeyPair) {
          throw new Error('No key pair found')
        }

        const keyPair = await importKeyPair(storedKeyPair)
        const clipboardText = await decryptMessage(encryptedData, keyPair.privateKey, currentDeviceId)

        setLastReceived(clipboardText)
        setText(clipboardText)
        setStatus('received')
        setStatusMessage('Received from another device')

        // Clear status after 3 seconds
        setTimeout(() => {
          setStatus('idle')
          setStatusMessage('')
        }, 3000)

        console.log('[QuickClipboard] Received clipboard from device:', fromDeviceId)
      } catch (error) {
        console.error('[QuickClipboard] Error receiving clipboard:', error)
      }
    }

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
  }, [client, isReady, currentDeviceId])

  const sendToDevices = useCallback(async () => {
    if (!client || !isReady || !currentDeviceId || !text.trim()) {
      return
    }

    setIsSending(true)
    setStatus('idle')
    setStatusMessage('')

    try {
      // Fetch devices
      const response = await fetch('/api/devices')
      if (!response.ok) {
        throw new Error('Failed to fetch devices')
      }

      const devices: Device[] = await response.json()
      const otherDevices = devices.filter((d) => d.id !== currentDeviceId)

      if (otherDevices.length === 0) {
        setStatus('error')
        setStatusMessage('No other devices to send to')
        return
      }

      // Send to each device
      let sentCount = 0
      for (const device of otherDevices) {
        if (!device.publicKey) continue

        try {
          const publicKey = await importPublicKey(device.publicKey)
          const encryptedData = await encryptMessage(text, publicKey)
          client.sendClipboardSync(encryptedData, device.id)
          sentCount++
        } catch (error) {
          console.error(`[QuickClipboard] Error sending to device ${device.deviceName}:`, error)
        }
      }

      if (sentCount > 0) {
        setStatus('sent')
        setStatusMessage(`Sent to ${sentCount} device${sentCount > 1 ? 's' : ''}`)

        // Clear status after 3 seconds
        setTimeout(() => {
          setStatus('idle')
          setStatusMessage('')
        }, 3000)
      } else {
        setStatus('error')
        setStatusMessage('Failed to send to devices')
      }
    } catch (error) {
      console.error('[QuickClipboard] Error sending:', error)
      setStatus('error')
      setStatusMessage('Failed to send')
    } finally {
      setIsSending(false)
    }
  }, [client, isReady, currentDeviceId, text])

  const copyToClipboard = useCallback(async () => {
    if (!text.trim()) return

    try {
      await navigator.clipboard.writeText(text)
      setStatus('sent')
      setStatusMessage('Copied to clipboard')

      setTimeout(() => {
        setStatus('idle')
        setStatusMessage('')
      }, 2000)
    } catch (error) {
      console.error('[QuickClipboard] Error copying:', error)
    }
  }, [text])

  const pasteFromClipboard = useCallback(async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText) {
        setText(clipboardText)
      }
    } catch (error) {
      console.error('[QuickClipboard] Error pasting:', error)
      setStatus('error')
      setStatusMessage('Could not access clipboard')
      setTimeout(() => {
        setStatus('idle')
        setStatusMessage('')
      }, 2000)
    }
  }, [])

  return (
    <Card title="Quick Clipboard">
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Type or paste text here and send it to your other devices instantly.
        </p>

        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter text to share across devices..."
            className="w-full h-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          {text && (
            <button
              onClick={() => setText('')}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Clear"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status message */}
        {statusMessage && (
          <div
            className={`text-xs px-2 py-1 rounded ${
              status === 'sent'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : status === 'received'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : status === 'error'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {status === 'sent' && '✓ '}
            {status === 'received' && '↓ '}
            {status === 'error' && '✗ '}
            {statusMessage}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={sendToDevices}
            disabled={!text.trim() || isSending || !isReady || deviceCount === 0}
            variant="primary"
            className="flex-1 text-sm"
          >
            {isSending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Send to Devices
                {deviceCount > 0 && <span className="text-xs opacity-75">({deviceCount})</span>}
              </span>
            )}
          </Button>
        </div>

        <div className="flex gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={pasteFromClipboard}
            className="flex-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white py-1 flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Paste
          </button>
          <button
            onClick={copyToClipboard}
            disabled={!text.trim()}
            className="flex-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white py-1 flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            Copy
          </button>
        </div>

        {deviceCount === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            No other devices registered. Open this app on another device to sync.
          </p>
        )}
      </div>
    </Card>
  )
}
