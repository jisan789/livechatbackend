# LiveChat — Backend Server & Real-Time Gateway

A pure, high-performance real-time backend API server built with **FastAPI** and **WebSockets**. Optimized for zero-disk and containerized cloud environments (Render, Railway, Fly.io, AWS, Docker).

All user interface assets have been removed; this codebase functions strictly as a headless backend API and real-time WebSocket messaging gateway.

---

## 🌐 Live Production Base URL

- **REST Base URL**: `https://livechatbackend-tm3r.onrender.com`
- **WebSocket Gateway**: `wss://livechatbackend-tm3r.onrender.com/ws/{username}`
- **Interactive Swagger UI**: [https://livechatbackend-tm3r.onrender.com/docs](https://livechatbackend-tm3r.onrender.com/docs)
- **ReDoc Documentation**: [https://livechatbackend-tm3r.onrender.com/redoc](https://livechatbackend-tm3r.onrender.com/redoc)
- **OpenAPI Schema**: [https://livechatbackend-tm3r.onrender.com/openapi.json](https://livechatbackend-tm3r.onrender.com/openapi.json)
- **Health Check**: [https://livechatbackend-tm3r.onrender.com/health](https://livechatbackend-tm3r.onrender.com/health)

---

## Features

- **Pure Headless Backend**: No frontend/UI bloat; pure REST API + WebSocket gateway.
- **Interactive Documentation**: Built-in Swagger UI at `/docs` and ReDoc at `/redoc`.
- **Live Keystroke & Typing Streaming**:
  - `live_typing`: Character/word draft synchronization in real-time.
  - `typing_keystroke`: Sub-millisecond keystroke-by-keystroke audio/input streaming.
  - `typing_start` / `typing_stop`: Standard typing status indicators.
- **Full Settings Management via REST & WebSocket**:
  - Update user display name and avatar (`update_profile`).
  - Configure and verify 4-digit PIN passkeys (`set_passkey`, `verify_passkey`).
  - Safely clear conversation history between participants (`clear_chat`).
  - Query user directory and message history over WebSocket or REST.
- **Multi-Media Messaging**: Text chat, voice recordings, and images with automatic external persistence and instant delivery ACKs (`msg_ack`).
- **Presence & Read Receipts**: Real-time online/offline broadcasting, heartbeat pings, and read receipts (`seen`).

---

## Documentation

For the complete API reference, WebSocket event schemas, request/response models, and client code examples, see:
- 📖 **[API Documentation](API_DOCUMENTATION.md)**

---

## Quick Start (Local Development)

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Start Backend Server
```bash
python server.py
```
Or with Uvicorn CLI:
```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

---

## Deployment (Render)

1. Push this repository to GitHub.
2. In Render, create a new **Web Service** or use **Blueprint**:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python -m uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
3. Set optional environment variable `PHP_STORAGE_URL` if pointing to a custom SQLite/PDO storage receiver.
