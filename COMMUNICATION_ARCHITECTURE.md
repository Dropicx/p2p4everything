# Communication Architecture & Background Operation

## How E2E Encrypted Communication Works

### Current Implementation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User A (Browser Tab)                      │
│  ┌──────────────┐                                           │
│  │  Chat Page   │                                           │
│  │  (React)     │                                           │
│  └──────┬───────┘                                           │
│         │                                                     │
│         │ 1. User types message                              │
│         ▼                                                     │
│  ┌─────────────────┐                                         │
│  │ Encrypt Message │  (Client-side RSA-OAEP encryption)     │
│  │ with Recipient's│                                         │
│  │ Public Key      │                                         │
│  └──────┬──────────┘                                         │
│         │                                                     │
│         │ 2. Encrypted message ready                         │
│         ▼                                                     │
│  ┌─────────────────┐                                         │
│  │ WebRTC Data     │  (Peer-to-peer connection)             │
│  │ Channel Send    │                                         │
│  └──────┬──────────┘                                         │
│         │                                                     │
│         │ 3. Direct P2P transmission                         │
│         │    (via WebRTC, not through server)                │
│         ▼                                                     │
│  ┌─────────────────┐                                         │
│  │ Signaling       │  (WebSocket - only for connection      │
│  │ Server          │   setup, not message transport)        │
│  └──────┬──────────┘                                         │
│         │                                                     │
│         │ 4. Signaling (SDP, ICE candidates)                 │
│         │    (Helps establish WebRTC connection)             │
│         ▼                                                     │
│  ┌─────────────────┐                                         │
│  │ User B          │  (Must have chat tab open)            │
│  │ (Browser Tab)   │                                         │
│  └──────┬──────────┘                                         │
│         │                                                     │
│         │ 5. Receives encrypted message via WebRTC          │
│         ▼                                                     │
│  ┌─────────────────┐                                         │
│  │ Decrypt Message │  (Client-side with private key)         │
│  │ Display in UI   │                                         │
│  └─────────────────┘                                         │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **WebSocket (Signaling Server)**
   - **Purpose**: Only for establishing WebRTC connections
   - **What it does**: Exchanges SDP offers/answers and ICE candidates
   - **What it doesn't do**: Does NOT transport encrypted messages
   - **Connection**: Per-tab, closes when tab closes

2. **WebRTC Data Channels**
   - **Purpose**: Direct peer-to-peer encrypted message transport
   - **What it does**: Sends encrypted messages directly between browsers
   - **Connection**: Per-tab, closes when tab closes
   - **E2E**: Messages are encrypted before transmission

3. **E2E Encryption**
   - **When**: Messages encrypted client-side BEFORE sending
   - **Method**: RSA-OAEP (asymmetric) + AES-GCM (symmetric)
   - **Key Storage**: Private keys stored in IndexedDB (browser)
   - **Server**: Never sees plaintext, only stores metadata (hash, timestamp)

4. **Message Metadata API**
   - **Purpose**: Stores message metadata (not content)
   - **What's stored**: Sender, receiver, timestamp, encrypted content hash
   - **What's NOT stored**: Actual encrypted message content
   - **Use**: Message history, verification, delivery status

## Current Limitations

### ❌ Tab Must Be Open

**Yes, you currently need to have the chat tab open for real-time communication.**

**Why:**
- WebSocket connections are tied to the browser tab/window
- WebRTC peer connections are tied to the browser tab/window
- When you close the tab, both connections close
- No background service worker or persistent connection

**What happens when tab is closed:**
1. WebSocket disconnects from signaling server
2. WebRTC peer connection closes
3. Data channel closes
4. Incoming messages are **lost** (not queued)
5. User must reopen tab to reconnect

### ❌ No Offline Message Queuing

**Current behavior:**
- If recipient's tab is closed, messages cannot be delivered
- Messages are sent directly via WebRTC (no server relay)
- Server only stores metadata, not encrypted content
- No message queue for offline users

**What this means:**
- Messages sent to offline users are lost
- No "message sent but not delivered" status
- No notification when user comes back online

### ❌ No Push Notifications

**Current behavior:**
- No browser push notifications
- No service worker for background operation
- No way to notify user of new messages when tab is closed

## How It Works in Practice

### Scenario 1: Both Users Online (Tabs Open)

```
User A (Tab Open)                    User B (Tab Open)
     │                                    │
     │ 1. Types message                   │
     │ 2. Encrypts with B's public key    │
     │ 3. Sends via WebRTC data channel   │
     │───────────────────────────────────►│
     │                                    │ 4. Receives encrypted message
     │                                    │ 5. Decrypts with private key
     │                                    │ 6. Displays in chat
     │                                    │
     │ 7. Creates message metadata       │
     │    (stores hash, timestamp)        │
     │───────────────────────────────────►│
     │    (via REST API)                  │
```

✅ **Works perfectly** - Real-time, encrypted, direct P2P

### Scenario 2: Recipient Tab Closed

```
User A (Tab Open)                    User B (Tab Closed)
     │                                    │
     │ 1. Types message                   │
     │ 2. Encrypts with B's public key    │
     │ 3. Tries to send via WebRTC        │
     │───────────────────────────────────►│
     │                                    │ ❌ Connection failed
     │                                    │ ❌ Message lost
     │                                    │
     │ 4. Error: "Data channel not open" │
     │    (User sees error message)      │
```

❌ **Message is lost** - No queuing, no retry, no notification

## Improvements Needed for Background Operation

### Option 1: Service Worker + Message Queue (Recommended)

**What's needed:**
1. **Service Worker** - Runs in background, keeps WebSocket connection alive
2. **Message Queue on Server** - Store encrypted messages temporarily
3. **Push Notifications** - Notify user when message arrives
4. **Message Relay** - Server can relay messages when peer is offline

**Architecture:**
```
User A sends message
    │
    ├─► If User B online: Send via WebRTC (direct P2P)
    │
    └─► If User B offline: Store encrypted message on server
        │
        └─► When User B comes online:
            ├─► Push notification
            └─► Deliver queued messages via WebRTC or HTTP
```

**Benefits:**
- ✅ Works when tab is closed
- ✅ Messages not lost
- ✅ Push notifications
- ✅ Still E2E encrypted (server stores encrypted, can't decrypt)

**Challenges:**
- Need to store encrypted messages on server (currently only metadata)
- Need service worker implementation
- Need push notification setup
- More complex architecture

### Option 2: Hybrid Approach (Current + Queue)

**What's needed:**
1. **Try WebRTC first** - If peer is online, use direct P2P
2. **Fallback to server queue** - If peer is offline, queue on server
3. **Message retrieval** - When user opens tab, fetch queued messages

**Benefits:**
- ✅ Simpler than full service worker
- ✅ Still E2E encrypted
- ✅ Messages not lost

**Limitations:**
- ❌ Still need tab open to receive (but can queue)
- ❌ No push notifications
- ❌ Delayed delivery

### Option 3: Always Use Server Relay

**What's needed:**
1. **Server stores encrypted messages** - Always relay through server
2. **WebSocket for real-time** - Server pushes to online users
3. **Queue for offline** - Store until user comes online

**Benefits:**
- ✅ Works when tab is closed (with service worker)
- ✅ Messages never lost
- ✅ Simpler connection management

**Trade-offs:**
- ⚠️ Server sees encrypted messages (but can't decrypt)
- ⚠️ Less "pure" P2P (but still E2E encrypted)
- ⚠️ Server needs to store encrypted content

## Current State Summary

| Feature | Status | Notes |
|---------|--------|-------|
| E2E Encryption | ✅ Working | Client-side, server never sees plaintext |
| Direct P2P | ✅ Working | WebRTC data channels when both online |
| Tab Required | ❌ Yes | Must have chat tab open |
| Offline Messages | ❌ No | Messages lost if recipient offline |
| Push Notifications | ❌ No | No background notifications |
| Message History | ⚠️ Partial | Only metadata stored, not content |
| Background Operation | ❌ No | No service worker |

## Recommendations

### Short-term (Quick Fix)
1. **Add message queuing on server** - Store encrypted messages when peer offline
2. **Add message retrieval** - Fetch queued messages when opening chat
3. **Show connection status** - Clear indicator when peer is offline

### Long-term (Full Solution)
1. **Service Worker** - Keep connection alive in background
2. **Push Notifications** - Notify when messages arrive
3. **Message Queue API** - Store and retrieve encrypted messages
4. **Hybrid Delivery** - Try P2P first, fallback to server relay

## Technical Details

### WebSocket Connection Lifecycle

```javascript
// When tab opens
1. WebSocket connects to signaling server
2. Authenticates with Clerk token
3. Joins room for chat
4. Establishes WebRTC peer connection
5. Opens data channel

// When tab closes
1. Data channel closes
2. WebRTC peer connection closes
3. WebSocket disconnects
4. All connections lost
```

### WebRTC Connection Lifecycle

```javascript
// Connection establishment
1. User A creates offer (SDP)
2. Signaling server relays offer to User B
3. User B creates answer (SDP)
4. Signaling server relays answer to User A
5. ICE candidates exchanged via signaling
6. Peer connection established
7. Data channel opens

// Message sending
1. Encrypt message client-side
2. Send via data channel (direct P2P)
3. Recipient receives encrypted message
4. Decrypt client-side
5. Display in UI
```

### Encryption Flow

```javascript
// Sending
1. Get recipient's public key (from database)
2. Generate random AES key
3. Encrypt message with AES key
4. Encrypt AES key with recipient's RSA public key
5. Send: { encryptedData, encryptedKey, iv }

// Receiving
1. Receive encrypted message
2. Decrypt AES key with private key (from IndexedDB)
3. Decrypt message with AES key
4. Display plaintext
```

## Conclusion

**Current implementation:**
- ✅ Excellent for real-time communication when both users are online
- ✅ True E2E encryption (server never sees plaintext)
- ✅ Direct P2P (minimal server involvement)
- ❌ Requires tab to be open
- ❌ No offline message support
- ❌ No background operation

**For production use, you'll need:**
- Message queuing system
- Service worker for background operation
- Push notifications
- Hybrid delivery (P2P + server relay)

The current architecture is a solid foundation, but needs these additions for a complete messaging system.

