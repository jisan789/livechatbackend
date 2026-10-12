import asyncio
import datetime
import logging
from typing import Optional, List
from fastapi import APIRouter, Request, Query, Body
from fastapi.responses import JSONResponse
from app.auth import extract_token_from_request, verify_session_token
from app.crud import get_conversation, clear_conversation, mark_messages_seen, save_message
from app.websocket import connections, safe_send, send_to_user
from app.async_utils import run_in_thread
from app.schemas import SendMessageRequest, MarkSeenRequest, ClearChatRequest

logger = logging.getLogger("livechat.messages")
router = APIRouter(prefix="/api/messages", tags=["Messages & Conversations"])


@router.get(
    "",
    summary="Retrieve conversation history between two users",
    description="Fetches recent message history between the authenticated user (or user1) and target opponent (user2).",
)
async def api_get_messages(
    request: Request,
    user1: Optional[str] = Query(None, description="First participant username (defaults to authenticated user)"),
    user2: Optional[str] = Query(None, description="Second participant username"),
    opponent: Optional[str] = Query(None, description="Alternative alias for user2"),
):
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None

    u1 = (user1 or (current_user["username"] if current_user else "")).strip().lower()
    u2 = (user2 or opponent or "").strip().lower()

    if not u1 or not u2:
        return JSONResponse(
            {"status": "error", "message": "Both conversation participants (user1 and user2/opponent) must be specified."},
            status_code=400,
        )

    msgs = await run_in_thread(get_conversation, u1, u2)
    return {
        "status": "ok",
        "user1": u1,
        "user2": u2,
        "count": len(msgs),
        "messages": msgs,
    }


@router.post(
    "",
    summary="Send a message (Chat, Voice, or Image)",
    description="Saves a message to permanent storage and instantly forwards it to the recipient's active WebSocket connection if online.",
)
async def api_send_message(request: Request, payload: SendMessageRequest = Body(...)):
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None

    sender = (current_user["username"] if current_user else request.query_params.get("user") or "").strip().lower()
    recipient = payload.recipient.strip().lower()

    if not sender:
        return JSONResponse({"status": "error", "message": "Sender not authenticated. Provide valid session."}, status_code=401)
    if not recipient:
        return JSONResponse({"status": "error", "message": "Recipient username is required."}, status_code=400)
    if sender == recipient:
        return JSONResponse({"status": "error", "message": "Cannot send message to yourself."}, status_code=400)

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    client_time = payload.client_time or now_iso

    # Persist message
    saved_msg = await run_in_thread(
        save_message,
        sender=sender,
        recipient=recipient,
        msg_type=payload.msg_type,
        text_content=payload.text_content,
        media_duration=payload.media_duration,
        client_time=client_time,
        seen=False,
        reply_to=payload.reply_to,
        client_msg_id=payload.client_msg_id,
    )

    # Push to recipient if online via WebSocket
    is_delivered = False
    if recipient in connections:
        ws_payload = {
            "type": payload.msg_type,
            "from": sender,
            "to": recipient,
            "text": payload.text_content,
            "text_content": payload.text_content,
            "audio": payload.text_content if payload.msg_type == "voice" else None,
            "image": payload.text_content if payload.msg_type == "image" else None,
            "duration": payload.media_duration,
            "time": client_time,
            "id": payload.client_msg_id or saved_msg.get("id"),
            "msg_id": saved_msg.get("id"),
            "reply_to": payload.reply_to,
        }
        is_delivered = await send_to_user(recipient, ws_payload)

    return {
        "status": "ok",
        "delivered": is_delivered,
        "message": saved_msg,
    }


@router.post(
    "/clear",
    summary="Safely clear conversation messages between two users",
    description="Deletes chat messages and attached media ONLY between the two specified participants. Protected against full database wiping.",
)
async def api_clear_messages(request: Request, payload: ClearChatRequest = Body(...)):
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None

    user1 = (current_user["username"] if current_user else payload.user1 or "").strip().lower()
    user2 = payload.opponent.strip().lower()

    if not user1 or not user2:
        return JSONResponse(
            {
                "status": "error",
                "message": "Both conversation participants must be specified to delete messages. Database wipe prevented.",
            },
            status_code=400,
        )

    ok, deleted_count = await run_in_thread(clear_conversation, user1, user2)

    if not ok:
        return JSONResponse({"status": "error", "message": "Failed to clear conversation"}, status_code=500)

    # Notify connected opponent in real-time
    if user2 in connections:
        await safe_send(connections[user2], {"type": "chat_cleared", "from": user1})

    return {
        "status": "ok",
        "deleted_count": deleted_count,
        "message": f"Successfully deleted {deleted_count} messages between {user1} and {user2}.",
    }


@router.post(
    "/seen",
    summary="Mark messages as seen (Read Receipts)",
    description="Marks single, multiple, or all messages from an opponent as seen, and sends read notifications over WebSocket.",
)
async def api_mark_seen(request: Request, payload: MarkSeenRequest = Body(...)):
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None

    sender = (payload.sender or "").strip().lower()
    recipient = (current_user["username"] if current_user else payload.recipient or "").strip().lower()
    ids = payload.ids or []

    if not sender or not recipient:
        return JSONResponse({"status": "error", "message": "Both sender and recipient required"}, status_code=400)

    ok = await run_in_thread(mark_messages_seen, sender, recipient, None if payload.all else ids)

    # Notify sender in real-time that their messages were seen
    if sender in connections:
        await send_to_user(sender, {
            "type": "seen",
            "from": recipient,
            "ids": ids,
            "all": payload.all,
        })

    return {"status": "ok" if ok else "error"}
