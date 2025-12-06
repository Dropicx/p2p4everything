/**
 * Main WebRTC client for P2P connections
 * Integrates signaling and peer connections
 */

import { SignalingClient, type SignalingMessage } from './signaling'
import { PeerConnection, type PeerConnectionConfig } from './peer'

export interface WebRTCClientConfig {
  signalingUrl: string
  token?: string
  deviceId?: string
  databaseUserId?: string
  iceServers?: RTCConfiguration['iceServers']
  onMessage?: (message: string, fromUserId?: string) => void
  onConnectionChange?: (connected: boolean) => void
  onPeerConnectionChange?: (state: RTCPeerConnectionState) => void
}

export class WebRTCClient {
  public signaling: SignalingClient // Make public so hooks can access it
  private peerConnections: Map<string, PeerConnection> = new Map()
  private dataChannels: Map<string, RTCDataChannel> = new Map()
  private userToConnectionId: Map<string, string> = new Map() // userId -> connectionId
  private config: WebRTCClientConfig

  constructor(config: WebRTCClientConfig) {
    this.config = config
    this.signaling = new SignalingClient(config.signalingUrl, (connected) => {
      this.config.onConnectionChange?.(connected)
    })

    // Set up signaling message handlers
    this.setupSignalingHandlers()

    // Track peer connections by user ID from signaling messages
    this.signaling.onMessage('peer-joined', (message) => {
      if (message.type === 'peer-joined' && message.userId) {
        this.userToConnectionId.set(message.userId, message.connectionId)
      }
    })

    this.signaling.onMessage('room-joined', (message) => {
      if (message.type === 'room-joined' && message.peers) {
        message.peers.forEach((peer) => {
          if (peer.userId && peer.connectionId) {
            this.userToConnectionId.set(peer.userId, peer.connectionId)
          }
        })
      }
    })

    // Handle peer disconnection
    this.signaling.onMessage('peer-left', (message) => {
      if (message.type === 'peer-left') {
        // Find userId by connectionId
        let userIdToRemove: string | null = null
        for (const [userId, connId] of this.userToConnectionId.entries()) {
          if (connId === message.connectionId) {
            userIdToRemove = userId
            break
          }
        }

        if (userIdToRemove) {
          console.log(`[WebRTC Client] Peer left: ${userIdToRemove}, cleaning up connection`)

          // Close and remove peer connection
          const peer = this.peerConnections.get(userIdToRemove)
          if (peer) {
            peer.close()
            this.peerConnections.delete(userIdToRemove)
          }

          // Remove data channel
          this.dataChannels.delete(userIdToRemove)

          // Remove from connection mapping
          this.userToConnectionId.delete(userIdToRemove)
        }
      }
    })
  }

  /**
   * Connect to signaling server
   */
  async connect(): Promise<void> {
    await this.signaling.connect(this.config.token, this.config.deviceId, this.config.databaseUserId)
  }

  /**
   * Disconnect from signaling server and close all peer connections
   */
  disconnect(): void {
    this.peerConnections.forEach((pc) => pc.close())
    this.peerConnections.clear()
    this.dataChannels.clear()
    this.signaling.disconnect()
  }

  /**
   * Connect to a peer (initiate connection)
   */
  async connectToPeer(
    targetUserId: string,
    targetConnectionId?: string,
    roomId?: string
  ): Promise<PeerConnection> {
    const connectionKey = targetUserId

    // Get connection ID if not provided
    if (!targetConnectionId) {
      targetConnectionId = this.userToConnectionId.get(targetUserId)
    }

    // Check if connection already exists
    const existing = this.peerConnections.get(connectionKey)
    if (existing) {
      const state = existing.getConnectionState()
      if (state === 'connected' || state === 'connecting') {
        return existing
      }
      // Close stale connection
      existing.close()
    }

    // Create peer connection
    const peerConfig: PeerConnectionConfig = {
      iceServers: this.config.iceServers,
      onDataChannel: (channel) => {
        this.setupMessageChannel(channel, targetUserId)
      },
      onIceCandidate: (candidate) => {
        this.signaling.sendIceCandidate(
          candidate.toJSON(),
          targetConnectionId,
          targetUserId,
          roomId
        )
      },
      onConnectionStateChange: (state) => {
        this.config.onPeerConnectionChange?.(state)
        if (state === 'closed' || state === 'failed') {
          this.peerConnections.delete(connectionKey)
        }
      },
    }

    const peer = new PeerConnection(peerConfig)
    this.peerConnections.set(connectionKey, peer)

    // Create data channel for messages
    const dataChannel = peer.createDataChannel('messages', {
      ordered: true,
    })
    this.setupMessageChannel(dataChannel, targetUserId)

    // Create offer
    const offer = await peer.createOffer()
    this.signaling.sendOffer(
      JSON.stringify(offer),
      targetConnectionId,
      targetUserId,
      roomId
    )

    return peer
  }

  /**
   * Handle incoming offer (answer the connection)
   */
  async handleOffer(
    offer: RTCSessionDescriptionInit,
    fromUserId: string,
    fromConnectionId?: string,
    roomId?: string
  ): Promise<void> {
    const connectionKey = fromUserId

    // Store connection ID mapping
    if (fromConnectionId) {
      this.userToConnectionId.set(fromUserId, fromConnectionId)
    }

    // Check if connection already exists
    let peer = this.peerConnections.get(connectionKey)

    if (!peer) {
      // Create peer connection
      const peerConfig: PeerConnectionConfig = {
        iceServers: this.config.iceServers,
        onDataChannel: (channel) => {
          this.setupMessageChannel(channel, fromUserId)
        },
        onIceCandidate: (candidate) => {
          this.signaling.sendIceCandidate(
            candidate.toJSON(),
            fromConnectionId,
            fromUserId,
            roomId
          )
        },
        onConnectionStateChange: (state) => {
          this.config.onPeerConnectionChange?.(state)
          if (state === 'closed' || state === 'failed') {
            this.peerConnections.delete(connectionKey)
          }
        },
      }

      peer = new PeerConnection(peerConfig)
      this.peerConnections.set(connectionKey, peer)
    }

    // Set remote description
    await peer.setRemoteDescription(offer)

    // Create answer
    const answer = await peer.createAnswer()
    this.signaling.sendAnswer(
      JSON.stringify(answer),
      fromConnectionId,
      fromUserId,
      roomId
    )
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(
    answer: RTCSessionDescriptionInit,
    fromUserId: string,
    fromConnectionId?: string
  ): Promise<void> {
    // Store connection ID mapping
    if (fromConnectionId) {
      this.userToConnectionId.set(fromUserId, fromConnectionId)
    }

    const peer = this.peerConnections.get(fromUserId)
    if (!peer) {
      console.warn('Received answer for unknown peer:', fromUserId)
      return
    }

    await peer.setRemoteDescription(answer)
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(
    candidate: RTCIceCandidateInit,
    fromUserId: string,
    fromConnectionId?: string
  ): Promise<void> {
    // Store connection ID mapping
    if (fromConnectionId) {
      this.userToConnectionId.set(fromUserId, fromConnectionId)
    }

    const peer = this.peerConnections.get(fromUserId)
    if (!peer) {
      console.warn('Received ICE candidate for unknown peer:', fromUserId)
      return
    }

    await peer.addIceCandidate(candidate)
  }

  /**
   * Send a message to a peer
   */
  sendMessage(userId: string, message: string): boolean {
    const channel = this.dataChannels.get(userId)
    if (!channel) {
      console.warn(`Data channel not found for user ${userId}. Connection may not be established yet.`)
      return false
    }

    if (channel.readyState !== 'open') {
      console.warn(
        `Data channel not open for user ${userId}. State: ${channel.readyState}. ` +
        `Connection may still be establishing. Please wait a moment and try again.`
      )
      return false
    }

    try {
      channel.send(message)
      return true
    } catch (error) {
      console.error('Error sending message:', error)
      return false
    }
  }

  /**
   * Check if data channel is open for a user
   */
  isDataChannelOpen(userId: string): boolean {
    const channel = this.dataChannels.get(userId)
    return channel?.readyState === 'open'
  }

  /**
   * Get data channel state for a user
   */
  getDataChannelState(userId: string): RTCDataChannelState | null {
    const channel = this.dataChannels.get(userId)
    return channel?.readyState || null
  }

  /**
   * Join a room
   */
  joinRoom(roomId: string): void {
    this.signaling.joinRoom(roomId)
  }

  /**
   * Leave a room
   */
  leaveRoom(roomId: string): void {
    this.signaling.leaveRoom(roomId)
  }

  /**
   * Set up signaling message handlers
   */
  private setupSignalingHandlers(): void {
    this.signaling.onMessage('offer', (message) => {
      if (message.type === 'offer') {
        const offer = JSON.parse(message.sdp) as RTCSessionDescriptionInit
        // Extract userId from message if available, otherwise use connectionId
        const userId = (message as any).fromUserId || message.fromConnectionId || ''
        this.handleOffer(
          offer,
          userId,
          message.fromConnectionId,
          message.roomId
        ).catch((error) => {
          console.error('Error handling offer:', error)
        })
      }
    })

    this.signaling.onMessage('answer', (message) => {
      if (message.type === 'answer') {
        const answer = JSON.parse(message.sdp) as RTCSessionDescriptionInit
        // Extract userId from message if available, otherwise use connectionId
        const userId = (message as any).fromUserId || message.fromConnectionId || ''
        this.handleAnswer(answer, userId, message.fromConnectionId).catch((error) => {
          console.error('Error handling answer:', error)
        })
      }
    })

    this.signaling.onMessage('ice-candidate', (message) => {
      if (message.type === 'ice-candidate') {
        // Extract userId from message if available, otherwise use connectionId
        const userId = (message as any).fromUserId || message.fromConnectionId || ''
        this.handleIceCandidate(
          message.candidate,
          userId,
          message.fromConnectionId
        ).catch((error) => {
          console.error('Error handling ICE candidate:', error)
        })
      }
    })
  }

  /**
   * Set up message data channel
   */
  private setupMessageChannel(
    channel: RTCDataChannel,
    userId: string
  ): void {
    this.dataChannels.set(userId, channel)

    channel.onmessage = (event) => {
      const message = event.data
      this.config.onMessage?.(message, userId)
    }

    channel.onerror = (error: Event) => {
      // Check if this is a normal closure (user disconnected)
      const rtcError = error as RTCErrorEvent
      if (rtcError.error?.message?.includes('User-Initiated Abort')) {
        console.log(`[WebRTC Client] Data channel closed for user ${userId} (peer disconnected)`)
      } else {
        console.error(`Data channel error for user ${userId}:`, error)
      }
    }

    channel.onclose = () => {
      console.log(`Data channel "messages" closed for user ${userId}`)
    }
  }

  /**
   * Get peer connection for a user
   */
  getPeerConnection(userId: string): PeerConnection | undefined {
    return this.peerConnections.get(userId)
  }

  /**
   * Check if connected to signaling server
   */
  isSignalingConnected(): boolean {
    return this.signaling.isConnected()
  }

  /**
   * Check if peer connection is established for a user
   */
  isPeerConnected(userId: string): boolean {
    const peer = this.peerConnections.get(userId)
    if (!peer) return false
    const state = peer.getConnectionState()
    return state === 'connected'
  }

  /**
   * Get peer connection state for a user
   */
  getPeerConnectionState(userId: string): RTCPeerConnectionState | null {
    const peer = this.peerConnections.get(userId)
    return peer ? peer.getConnectionState() : null
  }

  /**
   * Send clipboard sync message via signaling server
   * This will be routed to all devices of the same user
   */
  sendClipboardSync(encryptedData: string, toDeviceId?: string): void {
    if (!this.config.deviceId) {
      console.warn('[WebRTC Client] Cannot send clipboard sync: deviceId not set')
      return
    }
    this.signaling.sendClipboardSync(encryptedData, this.config.deviceId, toDeviceId)
  }

  /**
   * Send device revocation notification via signaling server
   * This notifies the target device that it has been revoked and should logout
   */
  sendDeviceRevoked(targetDeviceId: string, reason?: string): void {
    this.signaling.sendDeviceRevoked(targetDeviceId, reason)
  }
}

