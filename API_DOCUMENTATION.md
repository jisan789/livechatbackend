# LiveChat Backend API & Real-Time Gateway Specification

A high-performance, stateless pure backend server built with **FastAPI** and **WebSockets**. Supports real-time messaging, live keystroke streaming, live typing draft synchronization, user settings management via both REST and WebSockets, and external SQLite/PDO persistent storage.

Interactive documentation:
- **Swagger UI**: [`http://localhost:8000/docs`](http://localhost:8000/docs)
- **ReDoc**: [`http://localhost:8000/redoc`](http://localhost:8000/redoc)
- **OpenAPI Schema**: [`http://localhost:8000/openapi.json`](http://localhost:8000/openapi.json)

---

## 1. Architecture & Connection Overview

- **REST Base URL**: `http://localhost:8000/api`
- **WebSocket URL**: `ws://localhost:8000/ws/{username}`
- **Authentication**: HTTP-Only Cookie (`chat_session`), Bearer Token (`Authorization: Bearer <token>`), or query parameter (`?token=<token>`).

---

## 2. Real-Time WebSocket Protocol (`/ws/{username}`)

Connect to:
```text
ws://localhost:8000/ws/{username}
```
Upon connection, the server:
1. Marks `{username}` as online.
2. Broadcasts presence to all other connected users:
   ```json
   {
     "type": "presence",
     "user": "alice",
     "status": "online",
     "last_seen": null
   }
   ```
3. Handles bi-directional JSON events.

---

### A. Live Typing & Keystroke Streaming

#### 1. Live Typing Draft Streaming (`live_typing`)
Stream drafted text in real time as the user types:
- **Client $\to$ Server:**
  ```json
  {
    "type": "live_typing",
    "to": "bob",
    "text": "Hello, how are you today?"
  }
  ```
- **Server $\to$ Recipient (bob):**
  ```json
  {
    "type": "live_typing",
    "from": "alice",
    "text": "Hello, how are you today?"
  }
  ```

#### 2. Live Keystroke-by-Keystroke Streaming (`typing_keystroke`)
Stream every individual keystroke for sound effects, terminal feel, or character-by-character live rendering:
- **Client $\to$ Server:**
  ```json
  {
    "type": "typing_keystroke",
    "to": "bob",
    "key": "a",
    "sound": true
  }
  ```
- **Server $\to$ Recipient (bob):**
  ```json
  {
    "type": "typing_keystroke",
    "from": "alice",
    "key": "a",
    "sound": true
  }
  ```

#### 3. Typing Indicators (`typing_start` / `typing_stop`)
- **Client $\to$ Server:**
  ```json
  { "type": "typing_start", "to": "bob" }
  ```
  ```json
  { "type": "typing_stop", "to": "bob" }
  ```
- **Server $\to$ Recipient (bob):**
  ```json
  { "type": "typing_start", "from": "alice" }
  ```
  ```json
  { "type": "typing_stop", "from": "alice" }
  ```

---

### B. Real-Time Messaging

#### 1. Text Message (`chat`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "chat",
    "to": "bob",
    "text": "Hey Bob, let's connect!",
    "id": "client_msg_uuid_001",
    "reply_to": {
      "id": 12,
      "sender": "bob",
      "text": "Are you free?"
    }
  }
  ```
- **Server $\to$ Recipient (bob):**
  ```json
  {
    "type": "chat",
    "from": "alice",
    "to": "bob",
    "text": "Hey Bob, let's connect!",
    "id": "client_msg_uuid_001",
    "reply_to": { "id": 12, "sender": "bob", "text": "Are you free?" }
  }
  ```
- **Server $\to$ Sender (alice) Instant ACK:**
  ```json
  {
    "type": "msg_ack",
    "id": "client_msg_uuid_001",
    "status": "delivered",
    "server_time": "2026-10-12T17:30:00.000Z"
  }
  ```
  *(If recipient is offline, status is `"sent"` and message is persisted for later retrieval).*

#### 2. Voice Message (`voice`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "voice",
    "to": "bob",
    "audio": "data:audio/webm;base64,...",
    "duration": 4.5,
    "id": "client_msg_uuid_002"
  }
  ```

#### 3. Image Message (`image`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "image",
    "to": "bob",
    "image": "data:image/jpeg;base64,...",
    "id": "client_msg_uuid_003"
  }
  ```

#### 4. Balloon Emoji Reaction (`flying_emoji`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "flying_emoji",
    "to": "bob",
    "emoji": "❤️"
  }
  ```

#### 5. Read Receipts (`seen` / `mark_seen`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "seen",
    "to": "bob",
    "ids": [45, 46],
    "all": false
  }
  ```

---

### C. Settings Management via WebSocket

All application settings can be inspected and updated directly through the WebSocket connection without making additional HTTP requests:

#### 1. Update Profile Settings (`update_profile`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "update_profile",
    "display_name": "Alice Wonderland",
    "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=Alice"
  }
  ```
- **Server $\to$ Client Response:**
  ```json
  {
    "type": "profile_updated",
    "status": "ok",
    "user": {
      "username": "alice",
      "display_name": "Alice Wonderland",
      "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=Alice"
    }
  }
  ```

#### 2. Set / Change 4-Digit Passcode PIN (`set_passkey`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "set_passkey",
    "passkey": "1234"
  }
  ```
- **Server $\to$ Client Response:**
  ```json
  {
    "type": "passkey_set",
    "status": "ok",
    "success": true
  }
  ```

#### 3. Verify Passkey PIN (`verify_passkey`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "verify_passkey",
    "passkey": "1234"
  }
  ```
- **Server $\to$ Client Response:**
  ```json
  {
    "type": "passkey_verified",
    "status": "ok",
    "verified": true,
    "user": { ... }
  }
  ```

#### 4. Clear Conversation History (`clear_chat`)
Safely clears all messages between the sender and target recipient:
- **Client $\to$ Server:**
  ```json
  {
    "type": "clear_chat",
    "to": "bob"
  }
  ```
- **Server $\to$ Sender ACK:**
  ```json
  {
    "type": "chat_cleared_ack",
    "status": "ok",
    "opponent": "bob",
    "deleted_count": 14
  }
  ```
- **Server $\to$ Recipient (bob):**
  ```json
  {
    "type": "chat_cleared",
    "from": "alice"
  }
  ```

#### 5. Retrieve Users Directory (`get_users`)
- **Client $\to$ Server:**
  ```json
  { "type": "get_users" }
  ```
- **Server $\to$ Client Response:**
  ```json
  {
    "type": "users_list",
    "status": "ok",
    "users": [
      {
        "username": "bob",
        "display_name": "Bob",
        "avatar": "https://...",
        "has_passkey": true,
        "is_online": true,
        "last_seen": "2026-10-12T17:00:00Z"
      }
    ]
  }
  ```

#### 6. Retrieve Conversation History (`get_history`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "get_history",
    "to": "bob"
  }
  ```
- **Server $\to$ Client Response:**
  ```json
  {
    "type": "chat_history",
    "status": "ok",
    "opponent": "bob",
    "count": 2,
    "messages": [ ... ]
  }
  ```

#### 7. Ping / Heartbeat (`ping` / `presence_check`)
- **Client $\to$ Server:**
  ```json
  {
    "type": "ping",
    "partner": "bob"
  }
  ```
- **Server $\to$ Client Response:**
  ```json
  {
    "type": "pong",
    "user": "bob",
    "status": "online",
    "last_seen": null,
    "server_time": "2026-10-12T17:35:00Z"
  }
  ```

---

## 3. REST API Specification

### Authentication & Passkey

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user account |
| `POST` | `/api/auth/login` | Login with username/password |
| `POST` | `/api/auth/logout` | Revoke session & clear cookie |
| `GET` | `/api/auth/me` | Get current authenticated profile |
| `POST` | `/api/auth/passkey/setup` | Set/change 4-digit PIN passkey |
| `POST` | `/api/auth/passkey/verify` | Verify 4-digit PIN passkey |

#### `POST /api/auth/register`
**Request Body:**
```json
{
  "username": "alice",
  "password": "SecurePassword123!",
  "display_name": "Alice Smith",
  "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=alice",
  "passkey": "1234"
}
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "message": "Account created successfully",
  "user": {
    "username": "alice",
    "display_name": "Alice Smith",
    "avatar": "https://...",
    "has_passkey": true
  },
  "token": "4a7f9b8c...",
  "need_passkey_setup": false
}
```

#### `POST /api/auth/login`
**Request Body:**
```json
{
  "username": "alice",
  "password": "SecurePassword123!"
}
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "message": "Logged in successfully",
  "user": { ... },
  "token": "4a7f9b8c...",
  "has_passkey": true
}
```

#### `POST /api/auth/passkey/setup`
**Request Body:**
```json
{
  "passkey": "1234"
}
```

#### `POST /api/auth/passkey/verify`
**Request Body:**
```json
{
  "username": "alice",
  "passkey": "1234"
}
```

---

### Users & Profiles

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/users` | List registered users with online status |
| `GET` | `/api/user/profile` | Get current user profile |
| `POST` | `/api/user/profile` | Update display name & avatar settings |
| `GET` | `/api/users/{username}` | Get public profile by username |
| `GET` | `/api/presence/{username}` | Check online presence & last seen |

#### `POST /api/user/profile`
**Request Body:**
```json
{
  "display_name": "Alice Wonderland",
  "avatar": "https://api.dicebear.com/7.x/bottts/svg?seed=Wonderland"
}
```

---

### Messages & Conversations

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/messages?user1=alice&user2=bob` | Retrieve conversation history |
| `POST` | `/api/messages` | Send message via REST API (also delivers to WS!) |
| `POST` | `/api/messages/seen` | Mark messages as read |
| `POST` | `/api/messages/clear` | Clear conversation history between two users |

#### `POST /api/messages`
Send message via standard REST request. If recipient is connected to WebSocket, the message is instantly pushed to them:
**Request Body:**
```json
{
  "recipient": "bob",
  "msg_type": "chat",
  "text_content": "Hello Bob via REST!",
  "media_duration": null,
  "client_time": "2026-10-12T17:40:00Z",
  "client_msg_id": "uuid_789",
  "reply_to": null
}
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "delivered": true,
  "message": {
    "id": 142,
    "sender": "alice",
    "recipient": "bob",
    "msg_type": "chat",
    "text_content": "Hello Bob via REST!",
    "client_time": "2026-10-12T17:40:00Z",
    "client_msg_id": "uuid_789"
  }
}
```

#### `POST /api/messages/clear`
**Request Body:**
```json
{
  "opponent": "bob"
}
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "deleted_count": 8,
  "message": "Successfully deleted 8 messages between alice and bob."
}
```

---

### System & Health

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API Gateway discovery index & route directory |
| `GET` | `/health` | Server health, active online user list, and storage target |
| `GET` | `/ping` | Fast plain-text keep-alive ping (`alive`) |

---

## 4. Client Integration Examples

### JavaScript / Browser Client
```javascript
// Connect WebSocket
const ws = new WebSocket("ws://localhost:8000/ws/alice");

ws.onopen = () => {
  console.log("Connected to LiveChat Gateway");
  
  // Stream live typing draft
  ws.send(JSON.stringify({
    type: "live_typing",
    to: "bob",
    text: "Hello Bob!"
  }));

  // Send keystroke
  ws.send(JSON.stringify({
    type: "typing_keystroke",
    to: "bob",
    key: "H",
    sound: true
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case "live_typing":
      console.log(`${data.from} is currently drafting:`, data.text);
      break;
    case "typing_keystroke":
      console.log(`Keystroke from ${data.from}:`, data.key);
      break;
    case "chat":
      console.log(`New message from ${data.from}:`, data.text);
      break;
    case "msg_ack":
      console.log(`Message ${data.id} ACK status:`, data.status);
      break;
    case "presence":
      console.log(`User ${data.user} is now ${data.status}`);
      break;
  }
};
```

### Python Client
```python
import asyncio
import json
import websockets

async def main():
    async with websockets.connect("ws://localhost:8000/ws/alice") as ws:
        # Send live typing
        await ws.send(json.dumps({
            "type": "live_typing",
            "to": "bob",
            "text": "Drafting live message..."
        }))

        # Send chat message
        await ws.send(json.dumps({
            "type": "chat",
            "to": "bob",
            "text": "Hello world!",
            "id": "py_msg_001"
        }))

        # Listen for events
        async for msg in ws:
            data = json.loads(msg)
            print("Received event:", data)

asyncio.run(main())
```
