/**
 * Utility functions for sending real-time notifications via WebSocket
 */

/**
 * Send a WebSocket notification to a user
 */
export async function sendWebSocketNotification(
  recipientUserId: string,
  messageType: string,
  data: Record<string, any> = {}
): Promise<boolean> {
  try {
    // Convert WebSocket URL to HTTP URL for the /notify endpoint
    let signalingServerUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'http://localhost:3001'
    signalingServerUrl = signalingServerUrl.replace('wss://', 'https://').replace('ws://', 'http://')
    const notifyUrl = `${signalingServerUrl}/notify`

    console.log(`[WebSocket Notify] Sending ${messageType} to user ${recipientUserId}`)

    const response = await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientUserId,
        messageType,
        ...data,
      }),
    })

    if (response.ok) {
      const result = await response.json()
      console.log(`[WebSocket Notify] Success: notified ${result.notifiedCount} connections`)
      return true
    } else {
      console.warn(`[WebSocket Notify] Failed: ${response.status}`)
      return false
    }
  } catch (error) {
    console.error('[WebSocket Notify] Error:', error)
    return false
  }
}
