/**
 * Redis manager for signaling server
 * Handles connection state, rooms, and pub/sub for horizontal scaling
 */

import Redis from 'ioredis'

export interface ConnectionState {
  connectionId: string
  userId?: string
  deviceId?: string
  lastPing: number
}

export class RedisManager {
  private redis: Redis | null = null
  private subscriber: Redis | null = null
  private publisher: Redis | null = null
  private isEnabled: boolean = false

  constructor(redisUrl?: string) {
    if (!redisUrl) {
      console.warn('⚠️  Redis URL not provided - running in local mode (no persistence)')
      this.isEnabled = false
      return
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('❌ Redis connection failed after 3 retries')
            this.isEnabled = false
            return null
          }
          return Math.min(times * 100, 2000)
        },
      })

      // Separate clients for pub/sub
      this.subscriber = new Redis(redisUrl)
      this.publisher = new Redis(redisUrl)

      this.redis.on('connect', () => {
        console.log('✅ Redis connected')
        this.isEnabled = true
      })

      this.redis.on('error', (error) => {
        console.error('❌ Redis error:', error)
        this.isEnabled = false
      })
    } catch (error) {
      console.error('❌ Failed to initialize Redis:', error)
      this.isEnabled = false
    }
  }

  /**
   * Check if Redis is enabled and connected
   */
  isReady(): boolean {
    return this.isEnabled && this.redis !== null && this.redis.status === 'ready'
  }

  /**
   * Store connection state
   * TTL: 5 minutes (refreshed on ping)
   */
  async setConnection(connId: string, state: ConnectionState): Promise<void> {
    if (!this.isReady()) return

    try {
      await this.redis!.setex(
        `conn:${connId}`,
        300, // 5 minutes TTL
        JSON.stringify(state)
      )
    } catch (error) {
      console.error('Redis setConnection error:', error)
    }
  }

  /**
   * Get connection state
   */
  async getConnection(connId: string): Promise<ConnectionState | null> {
    if (!this.isReady()) return null

    try {
      const data = await this.redis!.get(`conn:${connId}`)
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('Redis getConnection error:', error)
      return null
    }
  }

  /**
   * Delete connection state
   */
  async deleteConnection(connId: string): Promise<void> {
    if (!this.isReady()) return

    try {
      await this.redis!.del(`conn:${connId}`)
    } catch (error) {
      console.error('Redis deleteConnection error:', error)
    }
  }

  /**
   * Add connection to room
   */
  async addToRoom(roomId: string, connId: string): Promise<void> {
    if (!this.isReady()) return

    try {
      await this.redis!.sadd(`room:${roomId}`, connId)
      // Set TTL for room (auto-cleanup empty rooms)
      await this.redis!.expire(`room:${roomId}`, 3600) // 1 hour
    } catch (error) {
      console.error('Redis addToRoom error:', error)
    }
  }

  /**
   * Remove connection from room
   */
  async removeFromRoom(roomId: string, connId: string): Promise<void> {
    if (!this.isReady()) return

    try {
      await this.redis!.srem(`room:${roomId}`, connId)

      // Clean up empty room
      const count = await this.redis!.scard(`room:${roomId}`)
      if (count === 0) {
        await this.redis!.del(`room:${roomId}`)
      }
    } catch (error) {
      console.error('Redis removeFromRoom error:', error)
    }
  }

  /**
   * Get all connections in a room
   */
  async getRoomMembers(roomId: string): Promise<string[]> {
    if (!this.isReady()) return []

    try {
      return await this.redis!.smembers(`room:${roomId}`)
    } catch (error) {
      console.error('Redis getRoomMembers error:', error)
      return []
    }
  }

  /**
   * Track user's online connections
   */
  async addUserConnection(userId: string, connId: string): Promise<void> {
    if (!this.isReady()) return

    try {
      await this.redis!.sadd(`user:${userId}:conns`, connId)
      await this.redis!.expire(`user:${userId}:conns`, 600) // 10 minutes
    } catch (error) {
      console.error('Redis addUserConnection error:', error)
    }
  }

  /**
   * Remove user connection
   */
  async removeUserConnection(userId: string, connId: string): Promise<void> {
    if (!this.isReady()) return

    try {
      await this.redis!.srem(`user:${userId}:conns`, connId)
    } catch (error) {
      console.error('Redis removeUserConnection error:', error)
    }
  }

  /**
   * Get user's active connections
   */
  async getUserConnections(userId: string): Promise<string[]> {
    if (!this.isReady()) return []

    try {
      return await this.redis!.smembers(`user:${userId}:conns`)
    } catch (error) {
      console.error('Redis getUserConnections error:', error)
      return []
    }
  }

  /**
   * Set user online status
   */
  async setUserOnline(userId: string, ttlSeconds: number = 60): Promise<void> {
    if (!this.isReady()) return

    try {
      await this.redis!.setex(`presence:${userId}`, ttlSeconds, Date.now().toString())
    } catch (error) {
      console.error('Redis setUserOnline error:', error)
    }
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    if (!this.isReady()) return false

    try {
      const exists = await this.redis!.exists(`presence:${userId}`)
      return exists === 1
    } catch (error) {
      console.error('Redis isUserOnline error:', error)
      return false
    }
  }

  /**
   * Publish signaling message to room (for multi-instance coordination)
   */
  async publishToRoom(roomId: string, message: any): Promise<void> {
    if (!this.isReady() || !this.publisher) return

    try {
      await this.publisher.publish(
        `room:${roomId}:msg`,
        JSON.stringify(message)
      )
    } catch (error) {
      console.error('Redis publishToRoom error:', error)
    }
  }

  /**
   * Subscribe to room messages (for multi-instance coordination)
   */
  async subscribeToRoom(
    roomId: string,
    handler: (message: any) => void
  ): Promise<void> {
    if (!this.isReady() || !this.subscriber) return

    try {
      await this.subscriber.subscribe(`room:${roomId}:msg`)

      this.subscriber.on('message', (channel, message) => {
        if (channel === `room:${roomId}:msg`) {
          try {
            const parsed = JSON.parse(message)
            handler(parsed)
          } catch (error) {
            console.error('Error parsing pub/sub message:', error)
          }
        }
      })
    } catch (error) {
      console.error('Redis subscribeToRoom error:', error)
    }
  }

  /**
   * Publish global signaling event (presence, etc.)
   */
  async publishEvent(event: string, data: any): Promise<void> {
    if (!this.isReady() || !this.publisher) return

    try {
      await this.publisher.publish(
        `signaling:${event}`,
        JSON.stringify(data)
      )
    } catch (error) {
      console.error('Redis publishEvent error:', error)
    }
  }

  /**
   * Subscribe to global signaling events
   */
  async subscribeToEvents(
    event: string,
    handler: (data: any) => void
  ): Promise<void> {
    if (!this.isReady() || !this.subscriber) return

    try {
      await this.subscriber.subscribe(`signaling:${event}`)

      this.subscriber.on('message', (channel, message) => {
        if (channel === `signaling:${event}`) {
          try {
            const parsed = JSON.parse(message)
            handler(parsed)
          } catch (error) {
            console.error('Error parsing event message:', error)
          }
        }
      })
    } catch (error) {
      console.error('Redis subscribeToEvents error:', error)
    }
  }

  /**
   * Close Redis connections
   */
  async close(): Promise<void> {
    if (this.redis) await this.redis.quit()
    if (this.subscriber) await this.subscriber.quit()
    if (this.publisher) await this.publisher.quit()
  }
}
