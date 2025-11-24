# WebRTC Signaling Server

This is the WebRTC signaling server for p2p4everything. It handles peer discovery, connection establishment, and message routing for P2P connections.

**Using @clerk/express SDK** - Modern, supported Clerk authentication for Express applications.

## Railway Deployment

**IMPORTANT:** When deploying this service to Railway, you must configure the service settings:

1. Go to Railway Dashboard → Your Project → Signaling Service
2. Click on **Settings** → **General**
3. Set **Root Directory** to: `services/signaling`
4. Save changes

This tells Railway to build and run from the `services/signaling` directory instead of the project root.

## Environment Variables

Set these in Railway:

```env
PORT=3001
CLERK_SECRET_KEY=sk_... (from Clerk dashboard)
NODE_ENV=production
```

Railway automatically provides these (no need to set):
- `RAILWAY_PUBLIC_DOMAIN` - Your service's public domain (e.g., p2p4everything-signal-prod.up.railway.app)
- `RAILWAY_STATIC_URL` - Alternative URL format
- The server automatically detects these and shows the correct URLs in logs

## Local Development

```bash
# From this directory (services/signaling)
npm install
npm run dev

# Server will start on http://localhost:3001
# Health check: http://localhost:3001/health
```

## Build

```bash
npm run build  # Compiles TypeScript to dist/
npm start      # Runs compiled server
```

## How It Works

- Accepts WebSocket connections from clients
- Authenticates users via Clerk JWT tokens
- Manages room-based peer discovery
- Routes WebRTC signaling messages (offer, answer, ICE candidates)
- Tracks active connections and user presence

## API

### WebSocket Messages

**Client → Server:**
- `authenticate` - Send JWT token for authentication
- `join-room` - Join a room for peer discovery
- `leave-room` - Leave a room
- `offer` - Send WebRTC offer to peer
- `answer` - Send WebRTC answer to peer
- `ice-candidate` - Send ICE candidate to peer
- `ping` - Keep connection alive

**Server → Client:**
- `connected` - Connection confirmation with connectionId
- `room-joined` - Room joined with list of peers
- `peer-joined` - New peer joined room
- `peer-left` - Peer left room
- `offer` - WebRTC offer from peer
- `answer` - WebRTC answer from peer
- `ice-candidate` - ICE candidate from peer
- `pong` - Ping response
- `error` - Error message

## Health Check

GET `/health` - Returns `{"status": "ok", "service": "signaling-server"}`
