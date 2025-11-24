/**
 * WebRTC peer connection wrapper
 * Manages RTCPeerConnection and data channels
 */

export interface PeerConnectionConfig {
  iceServers?: RTCConfiguration['iceServers']
  onDataChannel?: (channel: RTCDataChannel) => void
  onIceCandidate?: (candidate: RTCIceCandidate) => void
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void
}

export class PeerConnection {
  private pc: RTCPeerConnection
  private dataChannels: Map<string, RTCDataChannel> = new Map()
  private config: PeerConnectionConfig

  constructor(config: PeerConnectionConfig = {}) {
    this.config = config

    // Default ICE servers (STUN)
    const iceServers = config.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
    ]

    this.pc = new RTCPeerConnection({ iceServers })

    // Set up event handlers
    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.config.onIceCandidate) {
        this.config.onIceCandidate(event.candidate)
      }
    }

    this.pc.onconnectionstatechange = () => {
      if (this.config.onConnectionStateChange) {
        this.config.onConnectionStateChange(this.pc.connectionState)
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      if (this.config.onIceConnectionStateChange) {
        this.config.onIceConnectionStateChange(this.pc.iceConnectionState)
      }
    }

    this.pc.ondatachannel = (event) => {
      const channel = event.channel
      this.setupDataChannel(channel)
      if (this.config.onDataChannel) {
        this.config.onDataChannel(channel)
      }
    }
  }

  /**
   * Create a data channel
   */
  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
    const channel = this.pc.createDataChannel(label, options)
    this.setupDataChannel(channel)
    this.dataChannels.set(label, channel)
    return channel
  }

  /**
   * Get a data channel by label
   */
  getDataChannel(label: string): RTCDataChannel | undefined {
    return this.dataChannels.get(label)
  }

  /**
   * Set up data channel event handlers
   */
  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log(`Data channel "${channel.label}" opened`)
    }

    channel.onclose = () => {
      console.log(`Data channel "${channel.label}" closed`)
      this.dataChannels.delete(channel.label)
    }

    channel.onerror = (error) => {
      console.error(`Data channel "${channel.label}" error:`, error)
    }
  }

  /**
   * Create offer
   */
  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer(options)
    await this.pc.setLocalDescription(offer)
    return offer
  }

  /**
   * Create answer
   */
  async createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer(options)
    await this.pc.setLocalDescription(answer)
    return answer
  }

  /**
   * Set remote description
   */
  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(description)
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate)
  }

  /**
   * Get connection state
   */
  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState
  }

  /**
   * Get ICE connection state
   */
  getIceConnectionState(): RTCIceConnectionState {
    return this.pc.iceConnectionState
  }

  /**
   * Close the connection
   */
  close(): void {
    this.dataChannels.forEach((channel) => {
      channel.close()
    })
    this.dataChannels.clear()
    this.pc.close()
  }

  /**
   * Get the underlying RTCPeerConnection
   */
  getPeerConnection(): RTCPeerConnection {
    return this.pc
  }
}

