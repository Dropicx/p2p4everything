/**
 * Signaling client for WebRTC connection establishment
 * Connects to signaling server via WebSocket
 */

export type SignalingMessage =
  | { type: 'connected'; connectionId: string; authenticated: boolean }
  | { type: 'room-joined'; roomId: string; peers: Array<{ connectionId: string; userId?: string; deviceId?: string }> }
  | { type: 'peer-joined'; connectionId: string; roomId: string; userId?: string; deviceId?: string }
  | { type: 'peer-left'; connectionId: string; roomId: string }
  | { type: 'offer'; fromConnectionId: string; sdp: string; targetConnectionId?: string; targetUserId?: string; roomId?: string }
  | { type: 'answer'; fromConnectionId: string; sdp: string; targetConnectionId?: string; targetUserId?: string; roomId?: string }
  | { type: 'ice-candidate'; fromConnectionId: string; candidate: RTCIceCandidateInit; targetConnectionId?: string; targetUserId?: string; roomId?: string }
  | { type: 'message-notification'; senderId: string; timestamp: number }
  | { type: 'error'; message: string }
  | { type: 'pong' }

export class SignalingClient {
  private ws: WebSocket | null = null
  private connectionId: string | null = null
  private messageHandlers: Map<string, Set<(message: SignalingMessage) => void>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnecting = false
  private token: string | null = null
  private deviceId: string | null = null
  private databaseUserId: string | null = null

  constructor(
    private signalingUrl: string,
    private onConnectionChange?: (connected: boolean) => void
  ) {}

  /**
   * Connect to signaling server
   */
  async connect(token?: string, deviceId?: string, databaseUserId?: string): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    this.isConnecting = true
    this.token = token || null
    this.deviceId = deviceId || null
    this.databaseUserId = databaseUserId || null

    return new Promise((resolve, reject) => {
      try {
        // WebSocket doesn't support custom headers, so we'll send token in first message
        const ws = new WebSocket(this.signalingUrl)
        let authResolved = false

        ws.onopen = () => {
          this.ws = ws
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.onConnectionChange?.(true)

          // Send authentication, device ID, and database user ID in first message
          console.log('[Signaling] WebSocket opened, sending authentication...')
          ws.send(JSON.stringify({
            type: 'authenticate',
            token: this.token,
            deviceId: this.deviceId,
            databaseUserId: this.databaseUserId,
          }))

          // Don't resolve yet - wait for 'connected' message to confirm auth is complete
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as SignalingMessage

            // Wait for authentication confirmation before resolving
            if (message.type === 'connected' && !authResolved) {
              authResolved = true
              console.log('[Signaling] Authentication confirmed, connection ready')
              resolve()
            }

            this.handleMessage(message)
          } catch (error) {
            console.error('Error parsing signaling message:', error)
          }
        }

        ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.isConnecting = false
          reject(error)
        }

        ws.onclose = () => {
          this.ws = null
          this.connectionId = null
          this.onConnectionChange?.(false)
          this.isConnecting = false

          // Attempt to reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            setTimeout(() => {
              this.connect(this.token || undefined, this.deviceId || undefined, this.databaseUserId || undefined).catch(() => {
                // Silent fail on reconnect
              })
            }, this.reconnectDelay * this.reconnectAttempts)
          }
        }
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  /**
   * Disconnect from signaling server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectionId = null
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnection
  }

  /**
   * Send a message to the signaling server
   */
  send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: WebSocket not connected')
      return
    }

    this.ws.send(JSON.stringify(message))
  }

  /**
   * Join a room
   */
  joinRoom(roomId: string): void {
    console.log(`[Signaling] Sending join-room for roomId: ${roomId}`)
    this.send({
      type: 'join-room',
      roomId,
    })
  }

  /**
   * Leave a room
   */
  leaveRoom(roomId: string): void {
    this.send({
      type: 'leave-room',
      roomId,
    })
  }

  /**
   * Send WebRTC offer
   */
  sendOffer(
    sdp: string,
    targetConnectionId?: string,
    targetUserId?: string,
    roomId?: string
  ): void {
    this.send({
      type: 'offer',
      sdp,
      targetConnectionId,
      targetUserId,
      roomId,
    })
  }

  /**
   * Send WebRTC answer
   */
  sendAnswer(
    sdp: string,
    targetConnectionId?: string,
    targetUserId?: string,
    roomId?: string
  ): void {
    this.send({
      type: 'answer',
      sdp,
      targetConnectionId,
      targetUserId,
      roomId,
    })
  }

  /**
   * Send ICE candidate
   */
  sendIceCandidate(
    candidate: RTCIceCandidateInit,
    targetConnectionId?: string,
    targetUserId?: string,
    roomId?: string
  ): void {
    this.send({
      type: 'ice-candidate',
      candidate,
      targetConnectionId,
      targetUserId,
      roomId,
    })
  }

  /**
   * Register a message handler
   */
  onMessage(type: string, handler: (message: SignalingMessage) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set())
    }
    this.messageHandlers.get(type)!.add(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(type)
      if (handlers) {
        handlers.delete(handler)
      }
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: SignalingMessage): void {
    console.log(`[Signaling] Received message:`, message.type, message)

    // Handle connection confirmation
    if (message.type === 'connected') {
      this.connectionId = message.connectionId
      console.log(`[Signaling] Connected with connectionId: ${this.connectionId}`)
    }

    // Notify all handlers for this message type
    const handlers = this.messageHandlers.get(message.type)
    if (handlers) {
      console.log(`[Signaling] Found ${handlers.size} handlers for ${message.type}`)
      handlers.forEach((handler) => {
        try {
          handler(message)
        } catch (error) {
          console.error('Error in message handler:', error)
        }
      })
    } else {
      console.log(`[Signaling] No handlers registered for ${message.type}`)
    }

    // Also notify wildcard handlers
    const wildcardHandlers = this.messageHandlers.get('*')
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler(message)
        } catch (error) {
          console.error('Error in wildcard handler:', error)
        }
      })
    }
  }

  /**
   * Get current connection ID
   */
  getConnectionId(): string | null {
    return this.connectionId
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

