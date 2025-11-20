# Architecture Documentation

## System Overview

p2p4everything is built on a hybrid P2P architecture that combines direct peer-to-peer connections with a lightweight signaling infrastructure. The system is designed to be scalable, secure, and privacy-preserving.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Web App │  │  Mobile  │  │  Desktop │  │   CLI    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │          │
│       └─────────────┴─────────────┴─────────────┘          │
│                        │                                     │
│              ┌─────────▼──────────┐                         │
│              │  Client SDK/Lib   │                         │
│              │  - WebRTC Client  │                         │
│              │  - E2E Encryption │                         │
│              │  - Key Management │                         │
│              └─────────┬──────────┘                         │
└────────────────────────┼─────────────────────────────────────┘
                         │
         ┌────────────────┼────────────────┐
         │                │                │
┌────────▼────────┐ ┌────▼─────┐ ┌───────▼────────┐
│  Signaling      │ │  Auth    │ │  Metadata      │
│  Server         │ │  (Clerk) │ │  API           │
│  (WebSocket)    │ │          │ │  (REST/GraphQL)│
└────────┬────────┘ └──────────┘ └───────┬────────┘
         │                                │
         │                        ┌───────▼────────┐
         │                        │   PostgreSQL   │
         │                        │   Database     │
         │                        └────────────────┘
         │
┌────────▼────────────────────────────────────────┐
│         P2P Connection (WebRTC)                │
│  ┌──────────┐              ┌──────────┐        │
│  │  Peer A  │◄─────────────►│  Peer B  │        │
│  └──────────┘              └──────────┘        │
└─────────────────────────────────────────────────┘
```

## Core Components

### 1. Client Application Layer

**Responsibilities:**
- User interface and experience
- WebRTC peer connection management
- E2E encryption/decryption
- Key generation and storage
- File handling and transfer

**Technologies:**
- React/Next.js for web
- React Native for mobile
- Electron for desktop
- Shared TypeScript SDK

### 2. Authentication Service (Clerk)

**Responsibilities:**
- User registration and login
- Multi-device session management
- User profile management
- OAuth and social login support

**Integration:**
- Clerk handles all authentication
- User metadata synced to our database
- Device-specific tokens for key management

### 3. Signaling Server

**Responsibilities:**
- WebRTC signaling (ICE candidates, SDP offers/answers)
- Connection state management
- Peer discovery and routing
- Presence and online status

**Architecture:**
- WebSocket server (Node.js/TypeScript)
- Redis for pub/sub and session management
- Horizontal scaling with load balancer
- Connection pooling and rate limiting

### 4. Metadata API

**Responsibilities:**
- User profile management
- Connection metadata (not encrypted content)
- File metadata and advertisements
- Key exchange coordination (public keys only)

**Architecture:**
- RESTful API or GraphQL
- PostgreSQL for structured data
- Redis for caching
- Rate limiting and authentication

### 5. Database Layer

**PostgreSQL Schema:**
```sql
-- Users (synced from Clerk)
users (
  id UUID PRIMARY KEY,
  clerk_user_id VARCHAR UNIQUE,
  email VARCHAR,
  username VARCHAR,
  phone VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Devices
devices (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_name VARCHAR,
  device_type VARCHAR, -- web, mobile, desktop
  public_key TEXT, -- E2E encryption public key
  last_seen TIMESTAMP,
  created_at TIMESTAMP
)

-- Connections (who can connect to whom)
connections (
  id UUID PRIMARY KEY,
  user_a_id UUID REFERENCES users(id),
  user_b_id UUID REFERENCES users(id),
  status VARCHAR, -- pending, accepted, blocked
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- File Advertisements
file_advertisements (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_id UUID REFERENCES devices(id),
  file_name VARCHAR,
  file_hash VARCHAR, -- for deduplication
  file_size BIGINT,
  mime_type VARCHAR,
  metadata JSONB, -- encrypted metadata
  expires_at TIMESTAMP,
  created_at TIMESTAMP
)

-- Messages (metadata only, content is E2E encrypted)
messages_metadata (
  id UUID PRIMARY KEY,
  sender_id UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  message_type VARCHAR, -- text, file, call
  encrypted_content_hash VARCHAR,
  timestamp TIMESTAMP
)
```

### 6. Key Management System

**Architecture:**
- Each device generates its own E2E key pair (RSA 4096 or Ed25519)
- Private keys stored only on device (encrypted with device-specific key)
- Public keys stored in database for key exchange
- Key rotation support
- Key backup/recovery mechanism (encrypted with user's master key)

**Key Exchange Flow:**
1. Device A requests connection to User B
2. System retrieves User B's active devices and public keys
3. Device A encrypts session key with each of User B's device public keys
4. Devices establish WebRTC connection with encrypted signaling

### 7. WebRTC P2P Layer

**Connection Establishment:**
1. Client A initiates connection request
2. Signaling server routes request to Client B
3. ICE candidates exchanged via signaling server
4. Direct P2P connection established
5. Data channel opened for encrypted communication

**Data Channels:**
- Text messages: DataChannel with encryption
- Files: DataChannel with chunking and resumable transfers
- Calls: MediaStream with encrypted RTP

### 8. File Sharing System

**File Advertisement:**
- User advertises file with metadata (name, size, hash)
- Metadata stored in database
- File content never touches server
- P2P transfer initiated when requested

**File Pull:**
- Browse available files from connections
- Request file transfer via signaling
- Direct P2P transfer with progress tracking
- Resume capability for interrupted transfers

## Security Architecture

### Encryption Layers

1. **Transport Layer**: TLS for all client-server communication
2. **Application Layer**: E2E encryption for all P2P data
3. **Storage Layer**: Encrypted at rest for device keys

### Key Security Principles

- **Zero-Knowledge**: Server never sees plaintext content
- **Forward Secrecy**: Session keys rotated regularly
- **Device Isolation**: Each device has independent keys
- **Key Escrow Prevention**: No master keys stored on server

## Scalability Design

### Horizontal Scaling

**Signaling Server:**
- Stateless design with Redis pub/sub
- Multiple instances behind load balancer
- Sticky sessions for WebSocket connections

**API Server:**
- Stateless REST/GraphQL API
- Connection pooling for database
- Redis caching layer
- CDN for static assets

**Database:**
- PostgreSQL with read replicas
- Connection pooling (PgBouncer)
- Partitioning for large tables
- Indexing strategy for queries

### Caching Strategy

- Redis for session data
- Redis for presence/online status
- CDN for static assets
- Application-level caching for metadata

### Load Balancing

- Nginx/HAProxy for HTTP/WebSocket
- Health checks and auto-scaling
- Geographic distribution (future)

## Deployment Architecture

### Development
- Local Docker Compose setup
- Single instance of all services

### Production
- Containerized services on Railway
- Railway PostgreSQL database
- Railway Redis cache
- Clerk for authentication
- Railway for all application services (web app + signaling server)
- Railway CDN for static assets

## Monitoring and Observability

- **Logging**: Structured logging (Winston/Pino)
- **Metrics**: Prometheus + Grafana
- **Tracing**: OpenTelemetry
- **Error Tracking**: Sentry
- **Uptime Monitoring**: Health check endpoints

## Future Enhancements

1. **IPFS Integration**: For decentralized file storage
2. **Mesh Networking**: Offline P2P capabilities
3. **Blockchain Integration**: For decentralized identity (optional)
4. **Group Communication**: Multi-party encrypted channels
5. **Streaming**: Live video/audio streaming
6. **Mobile Apps**: Native iOS/Android apps

