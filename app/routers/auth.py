import asyncio
from fastapi import APIRouter, Request, Response, Body
from fastapi.responses import JSONResponse
from app.async_utils import run_in_thread
from app.auth import (
    is_https_request,
    set_session_cookie,
    clear_session_cookie,
    extract_token_from_request,
    verify_session_token,
)
from app.crud import (
    register_user,
    authenticate_user,
    delete_session,
    set_user_passkey,
    verify_user_passkey,
    get_user_profile,
)
from app.schemas import (
    RegisterRequest,
    LoginRequest,
    PasskeySetupRequest,
    PasskeyVerifyRequest,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication & Security"])


@router.post(
    "/register",
    summary="Register a new user account",
    description="Creates a new user profile with optional display name, avatar, and 4-digit PIN passkey. Returns session token and sets session cookie.",
)
async def api_register(request: Request, response: Response, payload: RegisterRequest = Body(...)):
    username = payload.username.strip().lower()
    password = payload.password.strip()
    display_name = payload.display_name.strip() if payload.display_name else None
    avatar = payload.avatar.strip() if payload.avatar else None
    passkey = payload.passkey.strip() if payload.passkey else None

    user, token, err = await run_in_thread(
        register_user,
        username=username,
        password=password,
        display_name=display_name,
        avatar=avatar,
        passkey=passkey,
    )

    if err or not user:
        return JSONResponse({"status": "error", "message": err or "Registration failed"}, status_code=400)

    is_https = is_https_request(request)
    set_session_cookie(response, token, is_https)

    return {
        "status": "ok",
        "message": "Account created successfully",
        "user": user,
        "token": token,
        "need_passkey_setup": not bool(user.get("has_passkey")),
    }


@router.post(
    "/login",
    summary="Authenticate user & obtain session token",
    description="Validates username and password credentials. Sets HTTP-only session cookie and returns bearer token.",
)
async def api_login(request: Request, response: Response, payload: LoginRequest = Body(...)):
    username = payload.username.strip().lower()
    password = payload.password.strip()

    user, token, err = await run_in_thread(authenticate_user, username, password)
    if err or not user:
        return JSONResponse({"status": "error", "message": err or "Invalid credentials"}, status_code=401)

    is_https = is_https_request(request)
    set_session_cookie(response, token, is_https)

    return {
        "status": "ok",
        "message": "Logged in successfully",
        "user": user,
        "token": token,
        "has_passkey": bool(user.get("has_passkey")),
    }


@router.post(
    "/logout",
    summary="Log out & invalidate session",
    description="Revokes active session token on external database and clears browser session cookie.",
)
async def api_logout(request: Request, response: Response):
    token = extract_token_from_request(request)
    if token:
        await run_in_thread(delete_session, token)
    clear_session_cookie(response)
    return {"status": "ok", "message": "Logged out successfully"}


@router.get(
    "/me",
    summary="Get current authenticated user profile",
    description="Validates current session cookie or Bearer token and returns user profile details.",
)
async def api_get_me(request: Request):
    token = extract_token_from_request(request)
    if not token:
        return JSONResponse({"status": "unauthorized", "user": None}, status_code=401)

    user = await run_in_thread(verify_session_token, token)
    if not user:
        return JSONResponse({"status": "unauthorized", "user": None}, status_code=401)

    return {"status": "ok", "user": user}


@router.post(
    "/passkey/setup",
    summary="Configure or change 4-digit PIN passkey",
    description="Sets a 4-digit numeric passcode PIN for the user. Works via active session or explicit username parameter.",
)
async def api_set_passkey(request: Request, payload: PasskeySetupRequest = Body(...)):
    token = extract_token_from_request(request)
    user = await run_in_thread(verify_session_token, token) if token else None

    username = (user["username"] if user else payload.username or "").strip().lower()
    passkey = payload.passkey.strip()

    if not username:
        return JSONResponse({"status": "error", "message": "Not authenticated. Provide username or log in."}, status_code=401)
    if len(passkey) != 4 or not passkey.isdigit():
        return JSONResponse({"status": "error", "message": "Passkey must be exactly 4 digits (0-9)"}, status_code=400)

    ok = await run_in_thread(set_user_passkey, username, passkey)
    if ok:
        return {"status": "ok", "message": "Passkey configured successfully"}
    return JSONResponse({"status": "error", "message": "Could not set passkey"}, status_code=500)


@router.post(
    "/passkey/verify",
    summary="Verify user 4-digit PIN passkey",
    description="Checks if the submitted 4-digit passkey matches the stored passkey for the specified username.",
)
async def api_verify_passkey(request: Request, payload: PasskeyVerifyRequest = Body(...)):
    username = payload.username.strip().lower()
    passkey = payload.passkey.strip()

    if not username or not passkey:
        return JSONResponse({"status": "error", "message": "Missing username or passkey"}, status_code=400)

    valid = await run_in_thread(verify_user_passkey, username, passkey)
    if valid:
        profile = await run_in_thread(get_user_profile, username)
        return {"status": "ok", "verified": True, "user": profile}
    return JSONResponse({"status": "error", "verified": False, "message": "Incorrect passcode"}, status_code=400)
