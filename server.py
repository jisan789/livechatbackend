"""
LiveChat Backend Server — Pure Real-Time API Gateway & WebSockets Hub
Stateless, high-throughput backend supporting REST API, WebSockets,
live keystroke streaming, live typing, full settings management, and external PHP/SQLite storage.
"""

import os
import json
import asyncio
import logging
import datetime
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Response, Query
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import PHP_STORAGE_URL, API_TITLE, API_VERSION, API_DESCRIPTION
from app.database import init_db
from app.auth import (
    extract_token_from_request,
    verify_session_token,
)
from app.crud import (
    update_user_presence,
    get_user_presence,
    get_conversation,
    clear_conversation,
    update_user_profile,
    get_user_profile,
    set_user_passkey,
    verify_user_passkey,
    get_all_users,
)
from app.websocket import (
    connections,
    safe_send,
    send_to_user,
    broadcast,
    background_save_message,
    background_mark_seen,
)
from app.async_utils import run_in_thread
from app.routers import auth as auth_router
from app.routers import users as users_router
from app.routers import messages as messages_router

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("livechat.server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: Stateless real-time gateway using external storage."""
    init_db()
    logger.info(f"[Server] Backend API Gateway online. Target storage: {PHP_STORAGE_URL}")
    yield
    logger.info("[Server] Backend shutdown complete.")


app = FastAPI(
    title=API_TITLE,
    version=API_VERSION,
    description=API_DESCRIPTION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS configuration for cross-origin API and WebSocket usage
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include modular API routers
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(messages_router.router)


# ─────────────────────────────────────────────────────────────
# Helper: Presence Broadcast
# ─────────────────────────────────────────────────────────────
async def broadcast_presence(user_key: str, status: str, last_seen_iso: Optional[str] = None):
    """Notify all connected clients about user presence changes."""
    payload = {
        "type": "presence",
        "user": user_key,
        "status": status,
        "last_seen": last_seen_iso,
    }
    await broadcast(payload, exclude=user_key)


# ─────────────────────────────────────────────────────────────
# Root API Discovery & Documentation Index
# ─────────────────────────────────────────────────────────────
@app.get("/", tags=["System & Discovery"])
async def root_index():
    """API Gateway index endpoint providing status, documentation URLs, and route directory."""
    return JSONResponse({
        "name": API_TITLE,
        "version": API_VERSION,
        "status": "online",
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_spec": "/openapi.json",
        },
        "realtime": {
            "websocket_endpoint": "/ws/{username}",
            "features": [
                "Live messaging (chat, voice, image)",
                "Live keystroke streaming (character-by-character)",
                "Live typing drafts & indicators",
                "Real-time settings (profile, passkey, conversation clear)",
                "Zero-latency message acknowledgments (msg_ack)",
                "Seen & read receipts",
                "Online presence & heartbeat",
            ],
        },
        "endpoints": {
            "auth": {
                "register": "POST /api/auth/register",
                "login": "POST /api/auth/login",
                "logout": "POST /api/auth/logout",
                "me": "GET /api/auth/me",
                "passkey_setup": "POST /api/auth/passkey/setup",
                "passkey_verify": "POST /api/auth/passkey/verify",
            },
            "users": {
                "list": "GET /api/users",
                "profile_get": "GET /api/user/profile",
                "profile_update": "POST /api/user/profile",
                "by_username": "GET /api/users/{username}",
                "presence": "GET /api/presence/{username}",
            },
            "messages": {
                "history": "GET /api/messages?user1={u1}&user2={u2}",
                "send": "POST /api/messages",
                "seen": "POST /api/messages/seen",
                "clear": "POST /api/messages/clear",
            },
            "system": {
                "health": "GET /health",
                "ping": "GET /ping",
            },
        },
    })


# ─────────────────────────────────────────────────────────────
# WebSocket Real-Time Chat, Live Typing & Settings Gateway
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws/{user_key}")
async def websocket_endpoint(websocket: WebSocket, user_key: str):
    """
    Bi-directional Real-Time WebSocket Gateway:
    - Live Typing & Live Keystrokes (real-time draft text, typing_start, typing_stop, typing_keystroke)
    - Messaging (chat, voice, image, reply_to, msg_ack)
    - Presence & Heartbeat (ping/pong, presence_check)
    - Reactions (flying_emoji)
    - Settings via WebSocket (update_profile, set_passkey, verify_passkey, clear_chat, get_history, get_users)
    """
    user_key = user_key.strip().lower()
    if not user_key:
        await websocket.close(code=4001, reason="Invalid user key")
        return

    await websocket.accept()

    # Gracefully replace existing connection if user reconnected or refreshed
    old_ws = connections.get(user_key)
    if old_ws is not None:
        try:
            await old_ws.close(code=1000, reason="Replaced by new connection")
        except Exception:
            pass

    connections[user_key] = websocket
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    asyncio.create_task(run_in_thread(update_user_presence, user_key, now_iso))
    logger.info(f"[+] {user_key} connected (total online: {len(connections)})")

    # Broadcast online presence
    await broadcast_presence(user_key, "online")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")
            target_user = (data.get("to") or data.get("recipient") or data.get("opponent") or "").strip().lower()
            data["from"] = user_key

            # 1. Heartbeat Ping & Presence Check
            if msg_type in ("ping", "presence_check"):
                now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                asyncio.create_task(run_in_thread(update_user_presence, user_key, now_iso))
                partner = (data.get("partner") or target_user).strip().lower()
                is_p_online = partner in connections if partner else False
                p_last_seen = None
                if partner and not is_p_online:
                    p_last_seen = await run_in_thread(get_user_presence, partner)
                await safe_send(
                    websocket,
                    {
                        "type": "pong" if msg_type == "ping" else "presence",
                        "user": partner or user_key,
                        "status": "online" if is_p_online else "offline",
                        "last_seen": p_last_seen,
                        "server_time": now_iso,
                    },
                )
                continue

            # 2. Live Typing, Keystroke Streaming & Indicators
            # Forwarded immediately with sub-millisecond latency to opponent
            if msg_type in ("live_typing", "typing_keystroke", "typing_start", "typing_stop"):
                if target_user:
                    await send_to_user(target_user, data)
                continue

            # 3. Flying Emoji Reactions
            if msg_type == "flying_emoji":
                if target_user:
                    await send_to_user(target_user, data)
                continue

            # 4. Standard Messages (chat, voice, image)
            if msg_type in ("chat", "voice", "image"):
                is_delivered = False
                if target_user:
                    is_delivered = await send_to_user(target_user, data)

                # Send instant delivery receipt / ACK to sender
                client_id = data.get("id") or data.get("client_msg_id")
                if client_id:
                    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                    await safe_send(
                        websocket,
                        {
                            "type": "msg_ack",
                            "id": client_id,
                            "status": "delivered" if is_delivered else "sent",
                            "server_time": now_iso,
                        },
                    )

                # Persist message to external storage in background
                if target_user:
                    asyncio.create_task(background_save_message(user_key, target_user, msg_type, data))
                    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                    asyncio.create_task(run_in_thread(update_user_presence, user_key, now_iso))
                continue

            # 5. Seen / Read Receipts
            if msg_type in ("seen", "mark_seen"):
                if target_user:
                    await send_to_user(target_user, data)
                    ids = data.get("ids") or ([data.get("msg_id")] if data.get("msg_id") else None)
                    is_all = data.get("all", False)
                    asyncio.create_task(
                        background_mark_seen(sender=target_user, recipient=user_key, ids=None if is_all else ids)
                    )
                continue

            # 6. Settings via WebSocket: Update Profile (Display Name & Avatar)
            if msg_type == "update_profile":
                display_name = data.get("display_name")
                avatar = data.get("avatar")
                updated = await run_in_thread(
                    update_user_profile,
                    username=user_key,
                    display_name=display_name,
                    avatar=avatar,
                )
                await safe_send(
                    websocket,
                    {
                        "type": "profile_updated",
                        "status": "ok" if updated else "error",
                        "user": updated,
                    },
                )
                continue

            # 7. Settings via WebSocket: Set / Change Passkey PIN
            if msg_type == "set_passkey":
                passkey = str(data.get("passkey", "")).strip()
                if len(passkey) == 4 and passkey.isdigit():
                    ok = await run_in_thread(set_user_passkey, user_key, passkey)
                    await safe_send(
                        websocket,
                        {"type": "passkey_set", "status": "ok" if ok else "error", "success": ok},
                    )
                else:
                    await safe_send(
                        websocket,
                        {"type": "passkey_set", "status": "error", "message": "Passkey must be a 4-digit number"},
                    )
                continue

            # 8. Settings via WebSocket: Verify Passkey PIN
            if msg_type == "verify_passkey":
                passkey = str(data.get("passkey", "")).strip()
                valid = await run_in_thread(verify_user_passkey, user_key, passkey)
                profile = await run_in_thread(get_user_profile, user_key) if valid else None
                await safe_send(
                    websocket,
                    {
                        "type": "passkey_verified",
                        "status": "ok" if valid else "error",
                        "verified": valid,
                        "user": profile,
                    },
                )
                continue

            # 9. Settings via WebSocket: Clear Conversation History
            if msg_type in ("clear_chat", "clear_messages"):
                if target_user:
                    ok, deleted_count = await run_in_thread(clear_conversation, user_key, target_user)
                    if ok:
                        # Notify recipient in real time
                        await send_to_user(target_user, {"type": "chat_cleared", "from": user_key})
                    # Confirm to sender
                    await safe_send(
                        websocket,
                        {
                            "type": "chat_cleared_ack",
                            "status": "ok" if ok else "error",
                            "opponent": target_user,
                            "deleted_count": deleted_count,
                        },
                    )
                continue

            # 10. Query via WebSocket: Get User Directory
            if msg_type == "get_users":
                users_list = await run_in_thread(get_all_users, user_key)
                for u in users_list:
                    u["is_online"] = u["username"] in connections
                await safe_send(
                    websocket,
                    {"type": "users_list", "status": "ok", "users": users_list},
                )
                continue

            # 11. Query via WebSocket: Get Conversation History
            if msg_type in ("get_history", "get_messages"):
                partner = target_user or data.get("partner")
                if partner:
                    msgs = await run_in_thread(get_conversation, user_key, partner)
                    await safe_send(
                        websocket,
                        {
                            "type": "chat_history",
                            "status": "ok",
                            "opponent": partner,
                            "count": len(msgs),
                            "messages": msgs,
                        },
                    )
                continue

            # Fallback: Forward any arbitrary custom event with 'to' field
            if target_user:
                await send_to_user(target_user, data)

    except WebSocketDisconnect:
        if connections.get(user_key) is websocket:
            connections.pop(user_key, None)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
            asyncio.create_task(run_in_thread(update_user_presence, user_key, now_iso))
            logger.info(f"[-] {user_key} disconnected (total online: {len(connections)})")
            await broadcast_presence(user_key, "offline", now_iso)
        else:
            logger.info(f"[-] {user_key} stale connection closed")


# ─────────────────────────────────────────────────────────────
# Auxiliary Presence & Direct Message History Endpoints
# ─────────────────────────────────────────────────────────────
@app.get("/api/presence/{user_key}", tags=["Users & Profiles"])
async def api_get_presence(user_key: str):
    """Retrieve online status and last seen timestamp for a specific user key."""
    user_key = user_key.strip().lower()
    is_online = user_key in connections
    last_seen = await run_in_thread(get_user_presence, user_key) if not is_online else None
    return JSONResponse({
        "status": "ok",
        "user": user_key,
        "is_online": is_online,
        "last_seen": last_seen,
    })


@app.get("/api/messages/{opponent}", tags=["Messages & Conversations"])
async def get_messages_opponent(opponent: str, request: Request):
    """Retrieve message history with opponent for authenticated user."""
    opponent = opponent.strip().lower()
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None
    user_key = current_user["username"] if current_user else request.query_params.get("user")

    if not user_key:
        return JSONResponse({"status": "error", "message": "User not authenticated"}, status_code=401)

    messages = await run_in_thread(get_conversation, user_key, opponent)
    is_online = opponent in connections
    last_seen = await run_in_thread(get_user_presence, opponent) if not is_online else None

    return JSONResponse({
        "status": "ok",
        "user": user_key,
        "opponent": opponent,
        "is_opponent_online": is_online,
        "opponent_last_seen": last_seen,
        "count": len(messages),
        "messages": messages,
    })


# ─────────────────────────────────────────────────────────────
# Health Check & Keep-Alive Ping
# ─────────────────────────────────────────────────────────────
@app.get("/ping", tags=["System & Discovery"])
@app.get("/api/ping", tags=["System & Discovery"])
async def ping():
    """Simple plain-text keep-alive endpoint returning 'alive'."""
    return PlainTextResponse("alive")


@app.get("/health", tags=["System & Discovery"])
async def health():
    """Health check endpoint showing online users count and external storage status."""
    return JSONResponse({
        "status": "alive",
        "online_users_count": len(connections),
        "online_users": list(connections.keys()),
        "external_storage": PHP_STORAGE_URL,
    })


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
