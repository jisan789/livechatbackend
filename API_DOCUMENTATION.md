# LiveChat Backend — Developer API & WebSocket Documentation

> **Base URL:** `https://livechatbackend-tm3r.onrender.com`  
> **WebSocket URL:** `wss://livechatbackend-tm3r.onrender.com/ws/{username}`  
> **Interactive Swagger UI:** [https://livechatbackend-tm3r.onrender.com/docs](https://livechatbackend-tm3r.onrender.com/docs)  
> **ReDoc Documentation:** [https://livechatbackend-tm3r.onrender.com/redoc](https://livechatbackend-tm3r.onrender.com/redoc)  
> **OpenAPI Specification:** [https://livechatbackend-tm3r.onrender.com/openapi.json](https://livechatbackend-tm3r.onrender.com/openapi.json)

---

## Table of Contents

1. [Quick Overview & Endpoints Directory](#1-quick-overview--endpoints-directory)
2. [Authentication Flow](#2-authentication-flow)
3. [REST API Reference](#3-rest-api-reference)
   - [Authentication & Passkey](#a-authentication--passkey)
   - [Users & Profiles](#b-users--profiles)
   - [Messages & Conversations](#c-messages--conversations)
   - [System & Health Checks](#d-system--health-checks)
4. [Real-Time WebSocket Protocol (`wss://...`)](#4-real-time-websocket-protocol)
   - [Connection & Presence](#a-connection--presence)
   - [Live Keystroke & Typing Streaming](#b-live-keystroke--typing-streaming)
   - [Real-Time Messaging & ACKs](#c-real-time-messaging--acks)
   - [Settings & Account via WebSocket](#d-settings--account-via-websocket)
   - [Heartbeat & Keep-Alive](#e-heartbeat--keep-alive)
5. [Complete Frontend Integration Example (JavaScript / TypeScript)](#5-complete-frontend-integration-example)
6. [Render Deployment & Free Tier Notes](#6-render-deployment--free-tier-notes)

---

## 1. Quick Overview & Endpoints Directory

All REST endpoints accept and return `application/json` unless stated otherwise.  
Cross-Origin Resource Sharing (CORS) is enabled with credentials support.

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/` | API Gateway index & discovery metadata | No |
| `GET` | `/health` | Server status & active connections count | No |
| `GET` | `/ping` | Lightweight keep-alive probe (returns `"alive"`) | No |
| `POST` | `/api/auth/register` | Register new account (with optional avatar & PIN) | No |
| `POST` | `/api/auth/login` | Login with username + password | No |
| `POST` | `/api/auth/logout` | Invalidate session token & clear cookie | Yes |
| `GET` | `/api/auth/me` | Fetch authenticated user identity | Yes |
| `POST` | `/api/auth/passkey/setup` | Set or update 4-digit PIN passkey | Yes / Username |
| `POST` | `/api/auth/passkey/verify`| Verify 4-digit PIN passkey | No |
| `GET` | `/api/users` | List all users with presence & last conversation | Optional |
| `GET` | `/api/users/{username}`| Fetch public profile for a specific username | No |
| `GET` | `/api/user/profile` | Get current authenticated profile | Yes |
| `POST` | `/api/user/profile` | Update display name or avatar | Yes |
| `GET` | `/api/presence/{user}` | Query online status and last seen timestamp | No |
| `GET` | `/api/messages` | Retrieve conversation history between two users | Yes / Query |
| `GET` | `/api/messages/{user}` | Retrieve conversation history with opponent | Yes |
| `POST` | `/api/messages` | Send message (chat, voice, image) | Yes |
| `POST` | `/api/messages/seen` | Mark messages as seen / read | Yes |
| `POST` | `/api/messages/clear`| Clear conversation history between two users | Yes |
| `WS` | `/ws/{username}` | High-throughput bi-directional real-time socket | Recommended |

---

## 2. Authentication Flow

The backend supports **three interchangeable authentication methods**:

1. **HTTP-Only Session Cookie (`chat_session`)**: Automatically set by the server upon calling `/api/auth/register` or `/api/auth/login`. When making `fetch` or `axios` requests from the browser, include `credentials: "include"`.
2. **Bearer Token Header**:
   ```http
   Authorization: Bearer <your_session_token>
   ```
3. **Query Parameter (Useful for WebSockets or environments without header controls)**:
   ```http
   https://livechatbackend-tm3r.onrender.com/api/users?token=<your_session_token>
   wss://livechatbackend-tm3r.onrender.com/ws/jisan?token=<your_session_token>
   ```

---

## 3. REST API Reference

### A. Authentication & Passkey

#### 1. Register Account
`POST https://livechatbackend-tm3r.onrender.com/api/auth/register`

Creates a user account and immediately logs the user in.

**Request Body:**
```json
{
  "username": "alice",
  "password": "Password123!",
  "display_name": "Alice Cooper",
  "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=alice",
  "passkey": "1234"
}
```
*Note: `display_name`, `avatar`, and `passkey` (4-digit numeric string) are optional.*

**cURL Example:**
```bash
curl -X POST https://livechatbackend-tm3r.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"Password123!","display_name":"Alice"}'
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "message": "Account created successfully",
  "user": {
    "username": "alice",
    "display_name": "Alice",
    "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=alice",
    "has_passkey": true,
    "created_at": "2026-10-12T18:00:00Z"
  },
  "token": "a1b2c3d4e5f6...",
  "need_passkey_setup": false
}
```

---

#### 2. User Login
`POST https://livechatbackend-tm3r.onrender.com/api/auth/login`

**Request Body:**
```json
{
  "username": "alice",
  "password": "Password123!"
}
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "message": "Logged in successfully",
  "user": {
    "username": "alice",
    "display_name": "Alice",
    "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=alice",
    "has_passkey": true
  },
  "token": "a1b2c3d4e5f6...",
  "has_passkey": true
}
```

---

#### 3. Current Authenticated User (`/me`)
`GET https://livechatbackend-tm3r.onrender.com/api/auth/me`

**cURL Example:**
```bash
curl -X GET https://livechatbackend-tm3r.onrender.com/api/auth/me \
  -H "Authorization: Bearer a1b2c3d4e5f6..."
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "user": {
    "username": "alice",
    "display_name": "Alice",
    "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=alice",
    "has_passkey": true
  }
}
```

---

#### 4. Setup 4-Digit Passcode PIN
`POST https://livechatbackend-tm3r.onrender.com/api/auth/passkey/setup`

**Request Body:**
```json
{
  "passkey": "1234",
  "username": "alice"
}
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "message": "Passkey PIN configured successfully"
}
```

---

#### 5. Verify Passcode PIN
`POST https://livechatbackend-tm3r.onrender.com/api/auth/passkey/verify`

Used for fast client-side screen unlocking, biometric prompt fallback, or private conversation unlock.

**Request Body:**
```json
{
  "username": "alice",
  "passkey": "1234"
}
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "verified": true,
  "message": "Passkey verified successfully",
  "user": {
    "username": "alice",
    "display_name": "Alice"
  }
}
```

---

#### 6. Logout
`POST https://livechatbackend-tm3r.onrender.com/api/auth/logout`

Revokes session token and clears cookie.

---

### B. Users & Profiles

#### 1. List All Users & Live Status
`GET https://livechatbackend-tm3r.onrender.com/api/users`

Query parameters:
- `current_user` *(optional)*: Current username to fetch preview snippet of last exchanged message.

**cURL Example:**
```bash
curl -X GET "https://livechatbackend-tm3r.onrender.com/api/users?current_user=alice"
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "total": 2,
  "users": [
    {
      "username": "bob",
      "display_name": "Bob Marley",
      "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=bob",
      "is_online": true,
      "last_seen": null,
      "last_message": {
        "text": "Sounds good!",
        "time": "2026-10-12T18:05:00Z",
        "unread_count": 0
      }
    }
  ]
}
```

---

#### 2. Get User Profile
`GET https://livechatbackend-tm3r.onrender.com/api/users/{username}`

**Response (200 OK):**
```json
{
  "status": "ok",
  "user": {
    "username": "bob",
    "display_name": "Bob Marley",
    "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=bob",
    "is_online": true,
    "last_seen": null
  }
}
```

---

#### 3. Update Profile
`POST https://livechatbackend-tm3r.onrender.com/api/user/profile`

**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "display_name": "Alice Wonderland",
  "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=AliceW"
}
```

---

#### 4. Presence Lookup
`GET https://livechatbackend-tm3r.onrender.com/api/presence/{username}`

**Response (200 OK):**
```json
{
  "status": "ok",
  "user": "bob",
  "is_online": false,
  "last_seen": "2026-10-12T17:50:00Z"
}
```

---

### C. Messages & Conversations

#### 1. Fetch Conversation History
`GET https://livechatbackend-tm3r.onrender.com/api/messages?user1=alice&user2=bob`  
or  
`GET https://livechatbackend-tm3r.onrender.com/api/messages/bob` *(with Authorization header)*

**Response (200 OK):**
```json
{
  "status": "ok",
  "user1": "alice",
  "user2": "bob",
  "count": 2,
  "messages": [
    {
      "id": 101,
      "sender": "alice",
      "recipient": "bob",
      "msg_type": "chat",
      "text_content": "Hey Bob, how are you?",
      "media_duration": null,
      "client_time": "10:30 AM",
      "seen": 1,
      "reply_to": null,
      "client_msg_id": "msg_001",
      "timestamp": "2026-10-12T18:00:00Z"
    },
    {
      "id": 102,
      "sender": "bob",
      "recipient": "alice",
      "msg_type": "chat",
      "text_content": "Doing great! Ready for the call.",
      "media_duration": null,
      "client_time": "10:31 AM",
      "seen": 1,
      "reply_to": {"id": 101, "sender": "alice", "text": "Hey Bob..."},
      "client_msg_id": "msg_002",
      "timestamp": "2026-10-12T18:01:00Z"
    }
  ]
}
```

---

#### 2. Send Message via REST API
`POST https://livechatbackend-tm3r.onrender.com/api/messages`

> **Note:** Messages can be sent over WebSocket (recommended for 0ms latency) or via this REST endpoint.

**Request Body:**
```json
{
  "recipient": "bob",
  "msg_type": "chat",
  "text_content": "Hello Bob!",
  "client_time": "10:35 AM",
  "client_msg_id": "client_uuid_999",
  "reply_to": null
}
```

For **voice** messages:
```json
{
  "recipient": "bob",
  "msg_type": "voice",
  "text_content": "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ8...",
  "media_duration": 3.8,
  "client_msg_id": "voice_uuid_101"
}
```

For **image** messages:
```json
{
  "recipient": "bob",
  "msg_type": "image",
  "text_content": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
  "client_msg_id": "img_uuid_102"
}
```

---

#### 3. Mark Messages as Seen
`POST https://livechatbackend-tm3r.onrender.com/api/messages/seen`

**Request Body:**
```json
{
  "opponent": "bob",
  "ids": [101, 102],
  "all": true
}
```

---

#### 4. Clear Conversation History
`POST https://livechatbackend-tm3r.onrender.com/api/messages/clear`

Permanently purges messages *only* between the two participants without affecting any other conversation.

**Request Body:**
```json
{
  "user1": "alice",
  "user2": "bob"
}
```

---

### D. System & Health Checks

#### 1. Keep-Alive Ping
`GET https://livechatbackend-tm3r.onrender.com/ping`

**Response (200 OK):**
```text
alive
```

#### 2. Health & Metrics Check
`GET https://livechatbackend-tm3r.onrender.com/health`

**Response (200 OK):**
```json
{
  "status": "alive",
  "online_users_count": 3,
  "online_users": ["alice", "bob", "jisan"],
  "external_storage": "https://cdn.jisanfx.top/chatdatabase/reciever.php"
}
```

---

## 4. Real-Time WebSocket Protocol

### A. Connection & Presence

Connect to:
```text
wss://livechatbackend-tm3r.onrender.com/ws/{username}
```
*(Example: `wss://livechatbackend-tm3r.onrender.com/ws/alice?token=a1b2c3d4...`)*

Upon connecting:
1. `{username}` is registered in the server's memory map.
2. Presence update is automatically broadcasted to all other users:
   ```json
   {
     "type": "presence",
     "user": "alice",
     "status": "online",
     "last_seen": null
   }
   ```
3. When the connection closes, an `offline` presence event is broadcasted with an ISO timestamp:
   ```json
   {
     "type": "presence",
     "user": "alice",
     "status": "offline",
     "last_seen": "2026-10-12T18:30:00Z"
   }
   ```

---

### B. Live Keystroke & Typing Streaming

#### 1. Live Draft Streaming (`live_typing`)
Stream what the user is typing character-by-character to the opponent in real-time.

- **Send to server:**
  ```json
  {
    "type": "live_typing",
    "to": "bob",
    "text": "What time should we meet"
  }
  ```
- **Recipient receives:**
  ```json
  {
    "type": "live_typing",
    "from": "alice",
    "text": "What time should we meet"
  }
  ```

#### 2. Live Keystroke Audio / Rhythm Streaming (`typing_keystroke`)
Streams every physical key press to reproduce typing sounds or dynamic terminal effects.

- **Send to server:**
  ```json
  {
    "type": "typing_keystroke",
    "to": "bob",
    "key": "m",
    "sound": true
  }
  ```
- **Recipient receives:**
  ```json
  {
    "type": "typing_keystroke",
    "from": "alice",
    "key": "m",
    "sound": true
  }
  ```

#### 3. Standard Typing Indicators (`typing_start` / `typing_stop`)
- **Send:** `{"type": "typing_start", "to": "bob"}`
- **Send:** `{"type": "typing_stop", "to": "bob"}`

---

### C. Real-Time Messaging & ACKs

#### 1. Text Chat (`chat`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "chat",
    "to": "bob",
    "text": "Hey Bob!",
    "id": "uuid_client_001",
    "reply_to": null
  }
  ```
- **Server $\to$ Sender Instant ACK (`msg_ack`):**
  ```json
  {
    "type": "msg_ack",
    "id": "uuid_client_001",
    "status": "delivered",
    "server_time": "2026-10-12T18:10:00Z"
  }
  ```
  *(Status is `"delivered"` if recipient is online, or `"sent"` if stored for offline delivery).*
- **Recipient receives:**
  ```json
  {
    "type": "chat",
    "from": "alice",
    "to": "bob",
    "text": "Hey Bob!",
    "id": "uuid_client_001",
    "time": "10:45 AM"
  }
  ```

#### 2. Voice Message (`voice`)
```json
{
  "type": "voice",
  "to": "bob",
  "audio": "data:audio/webm;base64,...",
  "duration": 4.2,
  "id": "voice_client_002"
}
```

#### 3. Image Message (`image`)
```json
{
  "type": "image",
  "to": "bob",
  "image": "data:image/jpeg;base64,...",
  "id": "img_client_003"
}
```

#### 4. Floating Emoji Reactions (`flying_emoji`)
```json
{
  "type": "flying_emoji",
  "to": "bob",
  "emoji": "🔥"
}
```

#### 5. Seen / Read Receipt Notification (`seen`)
```json
{
  "type": "seen",
  "to": "bob",
  "ids": [101, 102],
  "all": true
}
```

---

### D. Settings & Account via WebSocket

You can execute settings operations directly over the active socket without initiating extra HTTP requests:

| Operation | Client Event `type` | Payload | Server Response `type` |
| :--- | :--- | :--- | :--- |
| **Update Profile** | `update_profile` | `{"display_name": "New Name", "avatar": "URL"}` | `profile_updated` |
| **Setup Passkey** | `set_passkey` | `{"passkey": "1234"}` | `passkey_set` |
| **Verify Passkey** | `verify_passkey` | `{"passkey": "1234"}` | `passkey_verified` |
| **Clear Chat** | `clear_chat` | `{"with": "bob"}` | `chat_cleared` |
| **Query History**| `get_history` | `{"with": "bob"}` | `history_result` |
| **Query Users** | `get_users` | `{}` | `users_result` |

---

### E. Heartbeat & Keep-Alive

To keep the WebSocket connection alive across cloud proxies and mobile sleep states:
- **Client sends every 25 seconds:**
  ```json
  { "type": "ping" }
  ```
- **Server responds:**
  ```json
  { "type": "pong" }
  ```

---

## 5. Complete Frontend Integration Example

Here is a drop-in JavaScript / TypeScript class that manages WebSocket connectivity, reconnection, live typing, and messaging:

```javascript
// LiveChatClient.js
export class LiveChatClient {
  constructor(username, token, options = {}) {
    this.username = username.toLowerCase();
    this.token = token;
    this.baseUrl = options.baseUrl || "https://livechatbackend-tm3r.onrender.com";
    this.wsUrl = options.wsUrl || `wss://livechatbackend-tm3r.onrender.com/ws/${this.username}`;
    this.socket = null;
    this.pingTimer = null;
    this.listeners = new Map();
  }

  // Register event listener
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const list = this.listeners.get(event) || [];
    list.forEach(cb => cb(data));
  }

  // Connect to WebSocket gateway
  connect() {
    const url = this.token ? `${this.wsUrl}?token=${encodeURIComponent(this.token)}` : this.wsUrl;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log("[LiveChat] Connected to real-time gateway");
      this.emit("connected");
      this.startHeartbeat();
    };

    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.emit(payload.type, payload);
        this.emit("message_any", payload);
      } catch (err) {
        console.error("[LiveChat] Parse error:", err);
      }
    };

    this.socket.onclose = () => {
      console.warn("[LiveChat] Socket closed. Reconnecting in 3s...");
      this.stopHeartbeat();
      this.emit("disconnected");
      setTimeout(() => this.connect(), 3000);
    };

    this.socket.onerror = (err) => {
      console.error("[LiveChat] Socket error:", err);
    };
  }

  // Send raw payload
  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  // 1. Send Text Message
  sendMessage(to, text, replyTo = null) {
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.send({
      type: "chat",
      to: to.toLowerCase(),
      text: text,
      id: msgId,
      reply_to: replyTo,
    });
    return msgId;
  }

  // 2. Stream Live Keystroke Draft
  sendLiveTyping(to, draftText) {
    this.send({
      type: "live_typing",
      to: to.toLowerCase(),
      text: draftText,
    });
  }

  // 3. Stream Individual Keystroke
  sendKeystroke(to, key) {
    this.send({
      type: "typing_keystroke",
      to: to.toLowerCase(),
      key: key,
      sound: true,
    });
  }

  // 4. Send Read Receipt
  markSeen(to, messageIds = [], all = true) {
    this.send({
      type: "seen",
      to: to.toLowerCase(),
      ids: messageIds,
      all: all,
    });
  }

  // Heartbeat keep-alive
  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, 25000);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
```

### Usage Example:

```javascript
const client = new LiveChatClient("alice", "YOUR_SESSION_TOKEN");

// Listen for incoming messages
client.on("chat", (msg) => {
  console.log(`[${msg.from}]: ${msg.text}`);
});

// Listen for live keystrokes
client.on("live_typing", (data) => {
  console.log(`${data.from} is currently typing: "${data.text}"`);
});

// Listen for presence changes
client.on("presence", (data) => {
  console.log(`${data.user} is now ${data.status}`);
});

client.connect();

// Send a message
client.sendMessage("bob", "Hello from Render gateway!");
```

---

## 6. Render Deployment & Free Tier Notes

1. **Automatic SSL / TLS**: All requests on Render automatically use HTTPS (`https://`) and Secure WebSockets (`wss://`).
2. **Free Tier Cold Starts**: Render's free tier spins down after 15 minutes of inactivity. When spinning up from cold, the initial HTTP request may take 30–50 seconds.
   - **Tip**: Set up an uptime monitor (e.g. UptimeRobot, Better Uptime) to ping `https://livechatbackend-tm3r.onrender.com/ping` every 10 minutes to keep the instance warm 24/7.
3. **Stateless Scalability**: The backend retains zero data on local disk. All persistence routes through `https://cdn.jisanfx.top/chatdatabase/reciever.php`, meaning instances can restart or scale horizontally without data loss.
