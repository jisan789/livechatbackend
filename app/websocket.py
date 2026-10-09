import asyncio
import logging
from typing import Dict, Optional, List, Any
from fastapi import WebSocket, WebSocketDisconnect
from app.crud import save_message, update_user_presence, mark_messages_seen

logger = logging.getLogger("livechat.ws")

# In-memory registry of active WebSocket connections: {username: WebSocket}
connections: Dict[str, WebSocket] = {}


async def safe_send(ws: WebSocket, payload: dict) -> bool:
    """Send JSON payload over WebSocket, catching disconnects gracefully."""
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


async def send_to_user(recipient: str, payload: dict) -> bool:
    """Send payload to a specific connected recipient."""
    recipient = recipient.strip().lower()
    ws = connections.get(recipient)
    if ws:
        ok = await safe_send(ws, payload)
        if not ok:
            connections.pop(recipient, None)
            return False
        return True
    return False


async def broadcast(payload: dict, exclude: Optional[str] = None):
    """Broadcast JSON payload to all active users except the excluded user."""
    dead_users = []
    for uname, ws in list(connections.items()):
        if uname == exclude:
            continue
        ok = await safe_send(ws, payload)
        if not ok:
            dead_users.append(uname)
    for uname in dead_users:
        connections.pop(uname, None)


async def background_save_message(user_key: str, recipient: str, msg_type: str, data: dict):
    """Asynchronously persist a chat message without blocking WebSocket throughput."""
    try:
        if msg_type == "chat":
            content = data.get("text")
        elif msg_type == "image":
            content = data.get("image")
        else:
            content = data.get("audio")

        client_id = data.get("id") or data.get("client_msg_id")
        await asyncio.to_thread(
            save_message,
            sender=user_key,
            recipient=recipient,
            msg_type=msg_type,
            text_content=content,
            media_duration=data.get("duration"),
            client_time=data.get("time"),
            seen=False,
            reply_to=data.get("reply_to"),
            client_msg_id=client_id,
        )
    except Exception as e:
        logger.error(f"[WS] Error saving message in background: {e}")


async def background_mark_seen(sender: str, recipient: str, ids: Optional[list] = None):
    """Mark seen in background task."""
    try:
        await asyncio.to_thread(
            mark_messages_seen,
            sender=sender,
            recipient=recipient,
            msg_ids=ids,
        )
    except Exception as e:
        logger.error(f"[WS] Error marking seen in background: {e}")
