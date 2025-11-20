import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const PORT = process.env.PORT || 3001

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'signaling-server' })
})

// Store active connections
const connections = new Map<string, WebSocket>()
const rooms = new Map<string, Set<string>>()

// WebSocket connection handling
wss.on('connection', (ws: WebSocket, req) => {
  const connectionId = req.headers['x-connection-id'] as string || `conn-${Date.now()}-${Math.random()}`
  
  console.log(`New WebSocket connection: ${connectionId}`)
  connections.set(connectionId, ws)

  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    connectionId,
  }))

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

  // Handle connection close
  ws.on('close', () => {
    console.log(`Connection closed: ${connectionId}`)
    connections.delete(connectionId)
    
    // Remove from all rooms
    rooms.forEach((roomConnections, roomId) => {
      roomConnections.delete(connectionId)
      if (roomConnections.size === 0) {
        rooms.delete(roomId)
      }
    })
  })

  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${connectionId}:`, error)
  })
})

// Message routing
function handleMessage(connectionId: string, message: any, ws: WebSocket) {
  switch (message.type) {
    case 'join-room':
      handleJoinRoom(connectionId, message.roomId, ws)
      break
    case 'leave-room':
      handleLeaveRoom(connectionId, message.roomId)
      break
    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleSignalingMessage(connectionId, message)
      break
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }))
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
function handleJoinRoom(connectionId: string, roomId: string, ws: WebSocket) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set())
  }
  
  rooms.get(roomId)!.add(connectionId)
  console.log(`Connection ${connectionId} joined room ${roomId}`)

  // Notify other connections in the room
  const roomConnections = rooms.get(roomId)!
  roomConnections.forEach((connId) => {
    if (connId !== connectionId) {
      const conn = connections.get(connId)
      if (conn) {
        conn.send(JSON.stringify({
          type: 'peer-joined',
          connectionId,
          roomId,
        }))
      }
    }
  })

  ws.send(JSON.stringify({
    type: 'room-joined',
    roomId,
    peers: Array.from(roomConnections).filter(id => id !== connectionId),
  }))
}

function handleLeaveRoom(connectionId: string, roomId: string) {
  const roomConnections = rooms.get(roomId)
  if (roomConnections) {
    roomConnections.delete(connectionId)
    
    // Notify other connections
    roomConnections.forEach((connId) => {
      const conn = connections.get(connId)
      if (conn) {
        conn.send(JSON.stringify({
          type: 'peer-left',
          connectionId,
          roomId,
        }))
      }
    })

    if (roomConnections.size === 0) {
      rooms.delete(roomId)
    }
  }
}

// Signaling message forwarding
function handleSignalingMessage(connectionId: string, message: any) {
  const { targetConnectionId, roomId } = message

  if (targetConnectionId) {
    // Direct message to specific connection
    const targetConn = connections.get(targetConnectionId)
    if (targetConn) {
      targetConn.send(JSON.stringify({
        ...message,
        fromConnectionId: connectionId,
      }))
    }
  } else if (roomId) {
    // Broadcast to all connections in room except sender
    const roomConnections = rooms.get(roomId)
    if (roomConnections) {
      roomConnections.forEach((connId) => {
        if (connId !== connectionId) {
          const conn = connections.get(connId)
          if (conn) {
            conn.send(JSON.stringify({
              ...message,
              fromConnectionId: connectionId,
            }))
          }
        }
      })
    }
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`)
  console.log(`Health check available at http://localhost:${PORT}/health`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  wss.close(() => {
    server.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })
})

