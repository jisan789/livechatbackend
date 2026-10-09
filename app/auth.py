import logging
from typing import Optional, Dict, Any
from fastapi import Request, Response
from app.config import SESSION_COOKIE_NAME, COOKIE_MAX_AGE
from app.crud import verify_session_token

logger = logging.getLogger("livechat.auth")


def is_https_request(request: Request) -> bool:
    """
    Detect whether the incoming request is over HTTPS.
    Supports reverse proxies (Render, Cloudflare, Nginx) via X-Forwarded-Proto.
    On localhost / 127.0.0.1 over HTTP, this returns False so browsers accept the cookie.
    """
    proto = request.headers.get("x-forwarded-proto", "").lower()
    if proto == "https":
        return True
    host = request.headers.get("host", "").lower()
    if "localhost" in host or "127.0.0.1" in host:
        return False
    return request.url.scheme == "https"


def set_session_cookie(response: Response, token: str, is_https: bool = False):
    """
    Attach an HTTP-only, persistent session cookie to the response.
    Uses SameSite='lax' and path='/' for seamless cross-page persistence.
    """
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=is_https,
        path="/",
    )


def clear_session_cookie(response: Response):
    """Clear session cookie from user browser upon logout."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
    )


def extract_token_from_request(request: Request) -> Optional[str]:
    """
    Observe session token through multiple channels:
    1. HTTP-Only Cookie (primary & most secure)
    2. Authorization header (Bearer <token>)
    3. Query parameter (?token=<token>)
    """
    # 1. Check Cookie
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        return token.strip()

    # 2. Check Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token:
            return token

    # 3. Check query param
    token = request.query_params.get("token")
    if token:
        return token.strip()

    return None
