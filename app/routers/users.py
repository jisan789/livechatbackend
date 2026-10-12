import asyncio
from typing import Optional
from fastapi import APIRouter, Request, Body, Query
from fastapi.responses import JSONResponse
from app.auth import extract_token_from_request, verify_session_token
from app.crud import get_all_users, update_user_profile, get_user_profile
from app.websocket import connections
from app.async_utils import run_in_thread
from app.schemas import UpdateProfileRequest

router = APIRouter(prefix="/api", tags=["Users & Profiles"])


@router.get(
    "/users",
    summary="List all registered users & status",
    description="Returns the full directory of users with their display names, avatars, last seen timestamps, and real-time online status.",
)
async def api_get_users(request: Request, current_user: Optional[str] = Query(None, description="Current username to calculate last conversation message")):
    token = extract_token_from_request(request)
    current_user_obj = await run_in_thread(verify_session_token, token) if token else None
    current_uname = current_user_obj["username"] if current_user_obj else current_user

    users_list = await run_in_thread(get_all_users, current_uname)

    # Attach live online flag from active connections
    for u in users_list:
        uname = u["username"]
        u["is_online"] = uname in connections

    return {"status": "ok", "users": users_list, "total": len(users_list)}


@router.get(
    "/user/profile",
    summary="Get user profile",
    description="Retrieves profile for current user or a specified username query parameter.",
)
async def api_get_profile(request: Request, user: Optional[str] = Query(None, description="Username to fetch. Defaults to current authenticated user.")):
    token = extract_token_from_request(request)
    current_user_obj = await run_in_thread(verify_session_token, token) if token else None
    target_username = (user or (current_user_obj["username"] if current_user_obj else "")).strip().lower()

    if not target_username:
        return JSONResponse({"status": "error", "message": "Not authenticated or user not specified"}, status_code=401)

    profile = await run_in_thread(get_user_profile, target_username)
    if profile:
        profile["is_online"] = target_username in connections
        return {"status": "ok", "user": profile}
    return JSONResponse({"status": "error", "message": "User not found"}, status_code=404)


@router.get(
    "/users/{username}",
    summary="Get user profile by username",
    description="Retrieves public profile information and online status for a specific user.",
)
async def api_get_user_by_name(username: str):
    uname = username.strip().lower()
    profile = await run_in_thread(get_user_profile, uname)
    if profile:
        profile["is_online"] = uname in connections
        return {"status": "ok", "user": profile}
    return JSONResponse({"status": "error", "message": "User not found"}, status_code=404)


@router.post(
    "/user/profile",
    summary="Update current user profile settings",
    description="Updates the display name and/or avatar of the authenticated user. Changes are immediately saved and broadcasted to clients.",
)
async def api_update_profile(request: Request, payload: UpdateProfileRequest = Body(...)):
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None
    if not current_user:
        return JSONResponse({"status": "error", "message": "Unauthorized. Please authenticate first."}, status_code=401)

    display_name = payload.display_name.strip() if payload.display_name else None
    avatar = payload.avatar.strip() if payload.avatar else None

    updated = await run_in_thread(
        update_user_profile,
        username=current_user["username"],
        display_name=display_name,
        avatar=avatar,
    )

    if updated:
        return {"status": "ok", "message": "Profile updated successfully", "user": updated}
    return JSONResponse({"status": "error", "message": "Failed to update profile"}, status_code=400)
