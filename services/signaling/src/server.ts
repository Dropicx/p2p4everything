import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { createClerkClient } from '@clerk/express'
import { RedisManager } from './redis.js'

const app = express()
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const PORT = process.env.PORT || 3001
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY
const REDIS_URL = process.env.REDIS_URL

// Initialize Clerk client
const clerkClient = CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: CLERK_SECRET_KEY })
  : null

// Initialize Redis (with graceful fallback)
const redis = new RedisManager(REDIS_URL)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'signaling-server' })
})

// Store active connections with user/device mapping
interface ConnectionInfo {
  ws: WebSocket
  connectionId: string
  userId?: string  // Clerk user ID
  databaseUserId?: string  // Database user ID (UUID)
  deviceId?: string
  lastPing: number
}

const connections = new Map<string, ConnectionInfo>()
const rooms = new Map<string, Set<string>>()
const userConnections = new Map<string, Set<string>>() // databaseUserId -> Set of connectionIds

// Verify Clerk JWT token
async function verifyToken(token: string): Promise<{ userId: string } | null> {
  if (!clerkClient) {
    console.warn('CLERK_SECRET_KEY not set, skipping authentication')
    return null
  }

  try {
    // Decode JWT payload to get user ID
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
    const userId = payload.sub || payload.user_id

    if (userId) {
      // Verify user exists in Clerk using the new SDK
      try {
        await clerkClient.users.getUser(userId)
        return { userId }
      } catch (error) {
        console.error('User verification failed:', error)
        return null
      }
    }

    return null
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

// WebSocket connection handling
wss.on('connection', async (ws: WebSocket, req) => {
  const connectionId = `conn-${Date.now()}-${Math.random()}`

  let userId: string | undefined  // Clerk user ID
  let databaseUserId: string | undefined  // Database user ID (UUID)
  let deviceId: string | undefined
  let authenticated = false

  // Update connection info helper
  const updateConnectionInfo = () => {
    const connInfo = connections.get(connectionId)
    if (connInfo) {
      connInfo.userId = userId
      connInfo.databaseUserId = databaseUserId
      connInfo.deviceId = deviceId
      connections.set(connectionId, connInfo)
    }
  }

  // Handle authentication message (sent after connection)
  const authHandler = async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString())
      if (message.type === 'authenticate') {
        if (message.token) {
          const auth = await verifyToken(message.token)
          if (auth) {
            userId = auth.userId  // Clerk user ID
            authenticated = true
          }
        }

        if (message.databaseUserId) {
          databaseUserId = message.databaseUserId  // Database user ID (UUID)

          // Track user connections by database user ID
          if (!userConnections.has(databaseUserId)) {
            userConnections.set(databaseUserId, new Set())
          }
          userConnections.get(databaseUserId)!.add(connectionId)
        }

        if (message.deviceId) {
          deviceId = message.deviceId
        }

        // Update connection info
        updateConnectionInfo()

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: 'connected',
          connectionId,
          authenticated: !!userId,
        }))

        // Remove this handler and set up normal message handling
        ws.off('message', authHandler)
        setupMessageHandlers()
      }
    } catch (error) {
      console.error('Error handling auth message:', error)
    }
  }

  const setupMessageHandlers = () => {
    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        handleMessage(connectionId, message, ws)
      } catch (error) {
        console.error('Error parsing message:', error)
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }))
      }
    })
  }

  // Set up initial auth handler
  ws.on('message', authHandler)
  
  console.log(`New WebSocket connection: ${connectionId}`)
  
  const connectionInfo: ConnectionInfo = {
    ws,
    connectionId,
    userId,
    databaseUserId,
    deviceId,
    lastPing: Date.now(),
  }
  
  connections.set(connectionId, connectionInfo)

  // Handle connection close
  ws.on('close', () => {
    console.log(`Connection closed: ${connectionId}`)
    const connInfo = connections.get(connectionId)

    if (connInfo?.databaseUserId) {
      const userConns = userConnections.get(connInfo.databaseUserId)
      if (userConns) {
        userConns.delete(connectionId)
        if (userConns.size === 0) {
          userConnections.delete(connInfo.databaseUserId)
        }
      }
    }
    
    connections.delete(connectionId)
    
    // Remove from all rooms
    rooms.forEach((roomConnections, roomId) => {
      roomConnections.delete(connectionId)
      if (roomConnections.size === 0) {
        rooms.delete(roomId)
      } else {
        // Notify remaining peers
        roomConnections.forEach((connId) => {
          const conn = connections.get(connId)
          if (conn) {
            conn.ws.send(JSON.stringify({
              type: 'peer-left',
              connectionId,
              roomId,
            }))
          }
        })
      }
    })
  })

  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${connectionId}:`, error)
  })

  // Ping/pong for connection health
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      connectionInfo.lastPing = Date.now()
      ws.ping()
    } else {
      clearInterval(pingInterval)
    }
  }, 30000) // Ping every 30 seconds

  ws.on('pong', () => {
    connectionInfo.lastPing = Date.now()
  })
})

// Clean up stale connections
setInterval(() => {
  const now = Date.now()
  const staleTimeout = 120000 // 2 minutes
  
  connections.forEach((connInfo, connId) => {
    if (now - connInfo.lastPing > staleTimeout) {
      console.log(`Closing stale connection: ${connId}`)
      connInfo.ws.close()
    }
  })
}, 60000) // Check every minute

// Message routing
function handleMessage(connectionId: string, message: any, ws: WebSocket) {
  const connInfo = connections.get(connectionId)
  
  // Require authentication for most operations
  if (message.type !== 'ping' && !connInfo?.userId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Authentication required',
    }))
    return
  }

  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }))
      break
    case 'join-room':
      console.log(`[Message] Received join-room from ${connectionId}: roomId=${message.roomId}`)
      handleJoinRoom(connectionId, message.roomId, ws, connInfo).catch(error => {
        console.error(`[Message] Error in handleJoinRoom:`, error)
      })
      break
    case 'leave-room':
      handleLeaveRoom(connectionId, message.roomId)
      break
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleSignalingMessage(connectionId, message, connInfo)
      break
    case 'get-peers':
      handleGetPeers(connectionId, message.roomId, ws)
      break
    default:
      console.warn(`Unknown message type: ${message.type}`)
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`,
      }))
  }
}

// Room management
async function handleJoinRoom(connectionId: string, roomId: string, ws: WebSocket, connInfo: ConnectionInfo | undefined) {
  if (!roomId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room ID required',
    }))
    return
  }

  console.log(`[Room Join] Connection ${connectionId}${connInfo?.databaseUserId ? ` (db user: ${connInfo.databaseUserId})` : ''}${connInfo?.userId ? ` (clerk user: ${connInfo.userId})` : ''} joining room ${roomId}`)

  // Add to in-memory room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set())
  }

  const roomConnections = rooms.get(roomId)!
  const wasInRoom = roomConnections.has(connectionId)
  roomConnections.add(connectionId)

  // Also add to Redis if available
  if (redis.isReady()) {
    await redis.addToRoom(roomId, connectionId)
    console.log(`[Room Join] Added ${connectionId} to Redis room ${roomId}`)
  }

  if (!wasInRoom) {
    console.log(`[Room Join] Connection ${connectionId} successfully joined room ${roomId}`)
  }

  // Notify other connections in the room
  const peers: Array<{ connectionId: string; userId?: string; deviceId?: string }> = []
  roomConnections.forEach((connId) => {
    if (connId !== connectionId) {
      const peerConn = connections.get(connId)
      if (peerConn) {
        peers.push({
          connectionId: connId,
          userId: peerConn.databaseUserId,  // Send database user ID to client
          deviceId: peerConn.deviceId,
        })

        // Notify peer about new connection
        const peerJoinedMsg = {
          type: 'peer-joined',
          connectionId,
          roomId,
          userId: connInfo?.databaseUserId,  // Send database user ID to client
          deviceId: connInfo?.deviceId,
        }
        console.log(`[Room Join] Notifying peer ${connId} about new connection ${connectionId} (databaseUserId: ${connInfo?.databaseUserId})`)
        peerConn.ws.send(JSON.stringify(peerJoinedMsg))
      }
    }
  })

  const roomJoinedMessage = {
    type: 'room-joined',
    roomId,
    peers,
  }
  console.log(`[Room Join] Sending room-joined to ${connectionId}: roomId=${roomId}, peers=${peers.length}`)
  console.log(`[Room Join] Room-joined message:`, JSON.stringify(roomJoinedMessage))
  ws.send(JSON.stringify(roomJoinedMessage))
  console.log(`[Room Join] room-joined message sent successfully`)
}

function handleLeaveRoom(connectionId: string, roomId: string) {
  const roomConnections = rooms.get(roomId)
  if (roomConnections) {
    const wasInRoom = roomConnections.has(connectionId)
    roomConnections.delete(connectionId)
    
    if (wasInRoom) {
      // Notify other connections
      roomConnections.forEach((connId) => {
        const conn = connections.get(connId)
        if (conn) {
          conn.ws.send(JSON.stringify({
            type: 'peer-left',
            connectionId,
            roomId,
          }))
        }
      })
    }

    if (roomConnections.size === 0) {
      rooms.delete(roomId)
    }
  }
}

// Get peers in a room
function handleGetPeers(connectionId: string, roomId: string, ws: WebSocket) {
  const roomConnections = rooms.get(roomId)
  if (!roomConnections) {
    ws.send(JSON.stringify({
      type: 'peers',
      roomId,
      peers: [],
    }))
    return
  }

  const peers: Array<{ connectionId: string; userId?: string; deviceId?: string }> = []
  roomConnections.forEach((connId) => {
    if (connId !== connectionId) {
      const peerConn = connections.get(connId)
      if (peerConn) {
        peers.push({
          connectionId: connId,
          userId: peerConn.databaseUserId,  // Send database user ID to client
          deviceId: peerConn.deviceId,
        })
      }
    }
  })

  ws.send(JSON.stringify({
    type: 'peers',
    roomId,
    peers,
  }))
}

// Signaling message forwarding
function handleSignalingMessage(connectionId: string, message: any, connInfo: ConnectionInfo | undefined) {
  // Ensure user is authenticated before allowing signaling
  if (!connInfo?.userId) {
    const senderConn = connections.get(connectionId)
    if (senderConn) {
      senderConn.ws.send(JSON.stringify({
        type: 'error',
        message: 'Must be authenticated to send signaling messages. Please send authenticate message first.',
        originalType: message.type,
      }))
    }
    console.warn(`Signaling message rejected from unauthenticated connection: ${connectionId}`)
    return
  }

  const { targetConnectionId, roomId, targetUserId } = message

  const messagePayload = {
    ...message,
    fromConnectionId: connectionId,
    fromUserId: connInfo.userId,
    fromDeviceId: connInfo.deviceId,
  }

  if (targetConnectionId) {
    // Direct message to specific connection
    const targetConn = connections.get(targetConnectionId)
    if (targetConn) {
      targetConn.ws.send(JSON.stringify(messagePayload))
    } else {
      // Target not found, notify sender
      const senderConn = connections.get(connectionId)
      if (senderConn) {
        senderConn.ws.send(JSON.stringify({
          type: 'error',
          message: 'Target connection not found',
          originalType: message.type,
        }))
      }
    }
  } else if (targetUserId) {
    // Send to all connections for a specific user
    const userConns = userConnections.get(targetUserId)
    if (userConns && userConns.size > 0) {
      userConns.forEach((connId) => {
        if (connId !== connectionId) {
          const targetConn = connections.get(connId)
          if (targetConn) {
            targetConn.ws.send(JSON.stringify(messagePayload))
          }
        }
      })
    } else {
      // User not connected, notify sender
      const senderConn = connections.get(connectionId)
      if (senderConn) {
        senderConn.ws.send(JSON.stringify({
          type: 'error',
          message: 'Target user not connected',
          originalType: message.type,
        }))
      }
    }
  } else if (roomId) {
    // Broadcast to all connections in room except sender
    const roomConnections = rooms.get(roomId)
    if (roomConnections) {
      roomConnections.forEach((connId) => {
        if (connId !== connectionId) {
          const conn = connections.get(connId)
          if (conn) {
            conn.ws.send(JSON.stringify({
              ...message,
              fromConnectionId: connectionId,
              fromUserId: connInfo?.userId,
              fromDeviceId: connInfo?.deviceId,
            }))
          }
        }
      })
    }
  } else {
    // No target specified
    const senderConn = connections.get(connectionId)
    if (senderConn) {
      senderConn.ws.send(JSON.stringify({
        type: 'error',
        message: 'Target connection, user, or room required',
        originalType: message.type,
      }))
    }
  }
}

// Start server
server.listen(PORT, () => {
  // Determine the base URL based on environment
  const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN
  const RAILWAY_STATIC_URL = process.env.RAILWAY_STATIC_URL

  let baseUrl: string
  if (RAILWAY_PUBLIC_DOMAIN) {
    baseUrl = `https://${RAILWAY_PUBLIC_DOMAIN}`
  } else if (RAILWAY_STATIC_URL) {
    baseUrl = RAILWAY_STATIC_URL
  } else {
    baseUrl = `http://localhost:${PORT}`
  }

  console.log(`🚀 Signaling server running on port ${PORT}`)
  console.log(`📡 Health check: ${baseUrl}/health`)
  console.log(`🔌 WebSocket endpoint: ${baseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}`)

  if (!clerkClient) {
    console.warn('⚠️  CLERK_SECRET_KEY not set - authentication disabled')
  } else {
    console.log('✅ Clerk authentication enabled')
  }

  if (redis.isReady()) {
    console.log('✅ Redis connected and ready')
  } else {
    console.log('⚠️  Running in local mode (no Redis)')
  }
})

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, starting graceful shutdown...`)

  // Close WebSocket server (stops accepting new connections)
  wss.close(() => {
    console.log('✅ WebSocket server closed')
  })

  // Notify and close all active WebSocket connections
  let closedCount = 0
  connections.forEach((connInfo, connId) => {
    try {
      connInfo.ws.close(1001, 'Server shutting down')
      closedCount++
    } catch (error) {
      // Connection might already be closed
    }
  })
  console.log(`✅ Closed ${closedCount} WebSocket connections`)

  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed')
  })

  // Close Redis connections
  try {
    await redis.close()
    console.log('✅ Redis connections closed')
  } catch (error) {
    console.error('Error closing Redis:', error)
  }

  console.log('✅ Graceful shutdown complete')
  process.exit(0)
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
