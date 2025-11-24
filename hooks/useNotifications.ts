'use client'

import { useEffect, useState, useCallback } from 'react'

export type NotificationPermission = 'default' | 'granted' | 'denied'

interface ShowNotificationOptions {
  title: string
  body?: string
  icon?: string
  tag?: string
  data?: any
  onClick?: () => void
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    // Check if browser supports notifications
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true)
      setPermission(Notification.permission)
    }
  }, [])

  /**
   * Request notification permission from the user
   */
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) {
      console.warn('[Notifications] Browser does not support notifications')
      return 'denied'
    }

    if (Notification.permission === 'granted') {
      return 'granted'
    }

    if (Notification.permission === 'denied') {
      console.warn('[Notifications] User has denied notification permission')
      return 'denied'
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      console.log('[Notifications] Permission result:', result)
      return result
    } catch (error) {
      console.error('[Notifications] Error requesting permission:', error)
      return 'denied'
    }
  }, [isSupported])

  /**
   * Show a browser notification
   */
  const showNotification = useCallback(
    async (options: ShowNotificationOptions): Promise<void> => {
      if (!isSupported) {
        console.warn('[Notifications] Browser does not support notifications')
        return
      }

      // Request permission if not already granted
      const currentPermission = Notification.permission
      if (currentPermission !== 'granted') {
        const newPermission = await requestPermission()
        if (newPermission !== 'granted') {
          console.warn('[Notifications] Cannot show notification: permission not granted')
          return
        }
      }

      try {
        const notification = new Notification(options.title, {
          body: options.body,
          icon: options.icon, // Let browser use default if not specified
          tag: options.tag,
          data: options.data,
          requireInteraction: false,
          silent: false,
        })

        // Handle notification click
        if (options.onClick) {
          notification.onclick = () => {
            window.focus()
            options.onClick?.()
            notification.close()
          }
        }

        // Auto-close after 5 seconds
        setTimeout(() => {
          notification.close()
        }, 5000)

        console.log('[Notifications] Notification shown:', options.title)
      } catch (error) {
        console.error('[Notifications] Error showing notification:', error)
      }
    },
    [isSupported, requestPermission]
  )

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
  }
}
