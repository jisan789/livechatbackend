"""
LiveChat WebSocket Server
FastAPI backend for real-time 2-user chat.
Deploy on Render — reads PORT env variable automatically.
"""

import os
import json
import asyncio
import datetime
import time
import logging
import urllib.request
import urllib.error
from urllib.parse import urlparse
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from database import init_db, save_message, get_conversation, clear_messages, mark_messages_seen, update_user_last_seen, get_user_last_seen

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("livechat")

app = FastAPI(title="LiveChat Server", version="1.0.0")

# ─────────────────────────────────────────────────────────────
#  Push Notifications (ntfy.sh)
# ─────────────────────────────────────────────────────────────
NTFY_DEFAULT_TOPIC = os.environ.get("NTFY_TOPIC", "penappnotify").strip()
NTFY_TOPICS: dict[str, str] = {
    "jisu": os.environ.get("NTFY_TOPIC_JISU", NTFY_DEFAULT_TOPIC).strip(),
    "jenu": os.environ.get("NTFY_TOPIC_JENU", NTFY_DEFAULT_TOPIC).strip(),
}

DISPLAY_NAMES: dict[str, str] = {
    "jisu": "Jisu",
    "jenu": "Jenu",
}

RENDER_EXTERNAL_URL = os.environ.get("RENDER_EXTERNAL_URL", "").strip()
last_known_origin: str = os.environ.get("APP_URL", RENDER_EXTERNAL_URL).strip()

last_wake_up_times: dict[str, float] = {}
last_offline_message_push_times: dict[str, float] = {}


def get_click_url() -> str:
    return last_known_origin or "https://livechat.onrender.com"


def send_ntfy_push(topic: str, title: str, message: str, click_url: str = "", priority: str = "high", tags: str = "bell") -> bool:
    """Send push notification to ntfy.sh"""
    try:
        url = f"https://ntfy.sh/{topic}"
        headers = {
            "Title": title.encode("utf-8"),
            "Priority": priority,
            "Tags": tags,
        }
        if click_url:
            headers["Click"] = click_url

        req = urllib.request.Request(
            url,
            data=message.encode("utf-8"),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            logger.info(f"[ntfy] Sent push to topic '{topic}': status {response.status}")
            return True
    except Exception as e:
        logger.error(f"[ntfy] Failed to send push to '{topic}': {e}")
        return False


async def async_dispatch_push(recipient: str, sender: str, action_type: str, preview: str = ""):
    """Send push notification asynchronously via ntfy.sh."""
    topic = NTFY_TOPICS.get(recipient, NTFY_DEFAULT_TOPIC)
    sender_name = DISPLAY_NAMES.get(sender, sender.capitalize())
    click_url = get_click_url()

    if action_type == "wake_up":
        title = f"LiveChat — {sender_name} is calling you!"
        message = f"{sender_name} wants you to come online now! Tap to open. 💬"
        priority = "urgent"  # Max priority in ntfy: triggers ringtone, vibration & screen wakeup
        tags = "bell,phone,zap"
    elif action_type == "chat":
        title = f"💬 New message from {sender_name}"
        snip = preview.strip()[:100] if preview else "Sent a new message"
        message = snip
        priority = "high"
        tags = "speech_balloon"
    elif action_type == "voice":
        title = f"🎙️ Voice note from {sender_name}"
        dur = f" ({preview})" if preview else ""
        message = f"{sender_name} sent a voice message{dur}"
        priority = "high"
        tags = "microphone"
    elif action_type == "image":
        title = f"📷 Photo from {sender_name}"
        message = f"{sender_name} sent a photo"
        priority = "high"
        tags = "camera"
    else:
        title = f"LiveChat — Alert from {sender_name}"
        message = f"{sender_name} sent you an alert."
        priority = "high"
        tags = "bell"

    await asyncio.to_thread(send_ntfy_push, topic, title, message, click_url, priority, tags)


@app.on_event("startup")
async def startup_event():
    init_db()
    logger.info("[DB] SQLite database initialized.")

# ─────────────────────────────────────────────────────────────
#  Connection Registry
# ─────────────────────────────────────────────────────────────
VALID_USERS = {"jisu", "jenu"}
OPPONENTS: dict[str, str] = {"jisu": "jenu", "jenu": "jisu"}

# {user_key: WebSocket}
connections: dict[str, WebSocket] = {}


async def safe_send(ws: WebSocket, payload: dict) -> bool:
    """Send JSON safely, returns False if the connection is broken."""
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


async def notify_opponent(user_key: str, payload: dict):
    """Forward a payload to the opponent if they are connected."""
    opponent = OPPONENTS.get(user_key)
    if opponent and opponent in connections:
        ok = await safe_send(connections[opponent], payload)
        if not ok:
            connections.pop(opponent, None)


async def background_save_message(user_key: str, opponent: str, msg_type: str, data: dict):
    """Save message in the background without blocking real-time WebSocket communication."""
    try:
        if msg_type == "chat":
            content = data.get("text")
        elif msg_type == "image":
            content = data.get("image")
        else:
            content = data.get("audio")
        client_id = data.get("id") or data.get("client_msg_id")
        saved = await asyncio.to_thread(
            save_message,
            sender=user_key,
            recipient=opponent,
            msg_type=msg_type,
            text_content=content,
            media_duration=data.get("duration"),
            client_time=data.get("time"),
            seen=False,
            reply_to=data.get("reply_to"),
            client_msg_id=client_id,
        )
        logger.info(f"[DB] Async saved {msg_type} #{saved.get('id')} from {user_key} to {opponent}")
    except Exception as e:
        logger.error(f"[DB] Error saving message in background: {e}")


async def background_mark_seen(sender: str, recipient: str, ids: list | None = None):
    """Persist seen status in background task without blocking."""
    try:
        await asyncio.to_thread(
            mark_messages_seen,
            sender=sender,
            recipient=recipient,
            msg_ids=ids,
        )
        logger.info(f"[DB] Async marked messages seen from {sender} to {recipient}")
    except Exception as e:
        logger.error(f"[DB] Error marking seen in background: {e}")


# ─────────────────────────────────────────────────────────────
#  WebSocket Endpoint
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws/{user_key}")
async def websocket_endpoint(websocket: WebSocket, user_key: str):
    if user_key not in VALID_USERS:
        await websocket.close(code=4001, reason="Unknown user")
        return

    await websocket.accept()

    # If user already has an active connection (e.g. page refresh),
    # close the old one gracefully before replacing
    old_ws = connections.get(user_key)
    if old_ws is not None:
        try:
            await old_ws.close(code=1000, reason="Replaced by new connection")
        except Exception:
            pass

    global last_known_origin
    origin = websocket.headers.get("origin") or websocket.headers.get("referer")
    if origin and "localhost" not in origin and "127.0.0.1" not in origin:
        try:
            parsed = urlparse(origin)
            last_known_origin = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            pass

    connections[user_key] = websocket
    logger.info(f"[+] {user_key} connected  (total: {len(connections)})")

    opponent = OPPONENTS[user_key]
    is_opp_online = opponent in connections
    opp_last_seen = get_user_last_seen(opponent) if not is_opp_online else None

    # Tell opponent this user is now online
    await notify_opponent(user_key, {"type": "presence", "status": "online", "user": user_key})

    # Tell this user whether opponent is already online & last seen
    await safe_send(websocket, {
        "type": "presence",
        "status": "online" if is_opp_online else "offline",
        "user": opponent,
        "last_seen": opp_last_seen
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type", "")

            # 0. Heartbeat ping / presence check
            if msg_type in ("ping", "presence_check"):
                now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                asyncio.create_task(asyncio.to_thread(update_user_last_seen, user_key, now_iso))
                opp_last = get_user_last_seen(opponent) if not (opponent in connections) else None
                await safe_send(websocket, {
                    "type": "pong" if msg_type == "ping" else "presence",
                    "user": opponent,
                    "status": "online" if (opponent in connections) else "offline",
                    "last_seen": opp_last
                })
                continue

            # 0.5. Wake-up / Ping Call (Wake opponent up via ntfy push!)
            if msg_type in ("wake_up", "ping_call"):
                now_ts = time.time()
                last_ts = last_wake_up_times.get(user_key, 0)
                if now_ts - last_ts < 8:
                    logger.info(f"[ntfy] Wake_up cooldown active for {user_key}")
                    continue
                last_wake_up_times[user_key] = now_ts

                # Forward live event over WebSocket
                data["from"] = user_key
                await notify_opponent(user_key, data)

                # Send high-priority ntfy push notification to opponent's phone
                asyncio.create_task(async_dispatch_push(opponent, user_key, "wake_up"))
                continue

            # 1. Forward INSTANTLY over direct WebSocket (Zero Latency!)
            data["from"] = user_key
            await notify_opponent(user_key, data)

            # 2. Persist chat, voice & image messages to PHP/DB in background task without blocking live chat.
            if msg_type in ("chat", "voice", "image"):
                asyncio.create_task(background_save_message(user_key, opponent, msg_type, data))
                now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                asyncio.create_task(asyncio.to_thread(update_user_last_seen, user_key, now_iso))

                # If opponent is offline, send push notification to their phone via ntfy (debounced by 15s)
                if opponent not in connections:
                    now_ts = time.time()
                    last_push = last_offline_message_push_times.get(opponent, 0)
                    if now_ts - last_push >= 15:
                        last_offline_message_push_times[opponent] = now_ts
                        preview_text = ""
                        if msg_type == "chat":
                            preview_text = data.get("text", "")
                        elif msg_type == "voice":
                            dur = data.get("duration")
                            preview_text = f"{int(dur)}s" if dur else ""
                        asyncio.create_task(async_dispatch_push(opponent, user_key, msg_type, preview_text))

            # 3. Persist seen status to PHP/DB in background task
            if msg_type in ("seen", "mark_seen"):
                ids = data.get("ids") or ([data.get("msg_id")] if data.get("msg_id") else None)
                is_all = data.get("all", False)
                asyncio.create_task(background_mark_seen(sender=opponent, recipient=user_key, ids=None if is_all else ids))

            logger.debug(f"  {user_key} → {opponent}: {msg_type}")

    except WebSocketDisconnect:
        # CRITICAL: Only remove from dict if THIS websocket is still the current one.
        # If a new connection already replaced us, don't touch it.
        if connections.get(user_key) is websocket:
            connections.pop(user_key, None)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
            update_user_last_seen(user_key, now_iso)
            logger.info(f"[-] {user_key} disconnected (total: {len(connections)})")
            await notify_opponent(user_key, {
                "type": "presence",
                "status": "offline",
                "user": user_key,
                "last_seen": now_iso
            })
        else:
            logger.info(f"[-] {user_key} stale connection closed (replaced by newer)")



# ─────────────────────────────────────────────────────────────
#  Message History & Presence Endpoints
# ─────────────────────────────────────────────────────────────
@app.get("/api/presence/{user_key}")
async def api_get_presence(user_key: str):
    if user_key not in VALID_USERS:
        return JSONResponse({"status": "error", "message": "Unknown user"}, status_code=404)
    opponent = OPPONENTS[user_key]
    is_online = opponent in connections
    last_seen = get_user_last_seen(opponent) if not is_online else None
    return JSONResponse({
        "status": "ok",
        "user": user_key,
        "opponent": opponent,
        "is_online": is_online,
        "last_seen": last_seen
    })


@app.get("/api/messages/{user_key}")
async def get_messages(user_key: str):
    if user_key not in VALID_USERS:
        return JSONResponse({"status": "error", "message": "Unknown user"}, status_code=404)
    opponent = OPPONENTS[user_key]
    messages = get_conversation(user_key, opponent)
    is_online = opponent in connections
    last_seen = get_user_last_seen(opponent) if not is_online else None
    return JSONResponse({
        "status": "ok",
        "user": user_key,
        "opponent": opponent,
        "is_opponent_online": is_online,
        "opponent_last_seen": last_seen,
        "messages": messages
    })


@app.post("/api/messages/seen")
async def api_mark_seen(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    user_key = body.get("user")
    opponent = body.get("opponent") or (OPPONENTS.get(user_key) if user_key else None)
    ids = body.get("ids")
    is_all = body.get("all", False)
    if not user_key or user_key not in VALID_USERS or not opponent:
        return JSONResponse({"status": "error", "message": "Invalid user"}, status_code=400)

    ok = await asyncio.to_thread(
        mark_messages_seen,
        sender=opponent,
        recipient=user_key,
        msg_ids=None if is_all else ids,
    )

    if opponent in connections:
        await safe_send(connections[opponent], {
            "type": "seen",
            "from": user_key,
            "ids": ids,
            "all": is_all,
        })

    return JSONResponse({"status": "ok" if ok else "error"})


@app.post("/api/messages/clear")
async def api_clear_messages():
    ok = clear_messages()
    # Broadcast to all connected users that chat was cleared
    for ukey, ws in list(connections.items()):
        await safe_send(ws, {"type": "chat_cleared"})
    return JSONResponse({"status": "ok" if ok else "error"})


# ─────────────────────────────────────────────────────────────
#  Wake Up / Push Alert Endpoints
# ─────────────────────────────────────────────────────────────
@app.post("/api/wake_up")
async def api_wake_up(request: Request):
    global last_known_origin
    origin = request.headers.get("origin") or request.headers.get("referer")
    if origin and "localhost" not in origin and "127.0.0.1" not in origin:
        try:
            parsed = urlparse(origin)
            last_known_origin = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            pass

    try:
        body = await request.json()
    except Exception:
        body = {}
    user_key = body.get("user")
    if not user_key or user_key not in VALID_USERS:
        return JSONResponse({"status": "error", "message": "Invalid user"}, status_code=400)

    opponent = OPPONENTS[user_key]
    now_ts = time.time()
    last_ts = last_wake_up_times.get(user_key, 0)
    if now_ts - last_ts < 8:
        remaining = int(8 - (now_ts - last_ts))
        return JSONResponse({"status": "cooldown", "remaining": remaining})

    last_wake_up_times[user_key] = now_ts

    # Forward live event if opponent is connected
    if opponent in connections:
        await safe_send(connections[opponent], {"type": "wake_up", "from": user_key})

    # Dispatch ntfy push notification to opponent's phone
    asyncio.create_task(async_dispatch_push(opponent, user_key, "wake_up"))
    return JSONResponse({"status": "ok", "recipient": opponent})


@app.get("/api/ntfy/status")
async def api_ntfy_status():
    return JSONResponse({
        "status": "ok",
        "default_topic": NTFY_DEFAULT_TOPIC,
        "topics": NTFY_TOPICS,
        "click_url": get_click_url(),
        "connected_users": list(connections.keys())
    })



# ─────────────────────────────────────────────────────────────
#  Health Check & Keep-Alive Ping
# ─────────────────────────────────────────────────────────────
@app.get("/ping")
@app.get("/api/ping")
async def ping():
    return PlainTextResponse("alive")


@app.get("/health")
async def health():
    return JSONResponse({"status": "alive", "connected": list(connections.keys())})


# ─────────────────────────────────────────────────────────────
#  Static Files + SPA Catch-all
# ─────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/app.js")
async def serve_app_js():
    return FileResponse("static/app.js", media_type="application/javascript", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/style.css")
async def serve_style_css():
    return FileResponse("static/style.css", media_type="text/css", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


@app.get("/")
async def serve_root():
    return FileResponse("index.html", headers={"Cache-Control": "no-cache, no-store, must-revalidate"})


# ─────────────────────────────────────────────────────────────
#  Entry Point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
