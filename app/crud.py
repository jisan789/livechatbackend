import json
import logging
import datetime
import urllib.parse
import http.client
import ssl
import threading
from urllib.parse import urlparse
from typing import List, Dict, Any, Optional, Tuple
from app.config import PHP_STORAGE_URL

logger = logging.getLogger("livechat.crud")


class FastPHPClient:
    """Thread-safe persistent keep-alive HTTP/1.1 client for high-throughput PHP backend sync."""

    def __init__(self, url: str):
        self.url = url
        self.parsed = urlparse(url)
        self.host = self.parsed.hostname or "localhost"
        self.port = self.parsed.port or (443 if self.parsed.scheme == "https" else 80)
        self.is_ssl = self.parsed.scheme == "https"
        self.path = self.parsed.path or "/"
        self.ssl_ctx = ssl.create_default_context() if self.is_ssl else None
        self._local = threading.local()

    def _get_connection(self):
        conn = getattr(self._local, "conn", None)
        if conn is None:
            if self.is_ssl:
                conn = http.client.HTTPSConnection(self.host, self.port, context=self.ssl_ctx, timeout=12)
            else:
                conn = http.client.HTTPConnection(self.host, self.port, timeout=12)
            self._local.conn = conn
        return conn

    def call(self, params: Dict[str, Any], method: str = "POST", timeout: int = 15) -> Optional[Dict[str, Any]]:
        for attempt in range(2):
            conn = self._get_connection()
            try:
                headers = {"User-Agent": "LiveChat-Fast/2.0"}
                if method == "POST":
                    body = json.dumps(params).encode("utf-8")
                    headers["Content-Type"] = "application/json"
                    headers["Content-Length"] = str(len(body))
                    headers["Connection"] = "keep-alive"
                    conn.request("POST", self.path, body=body, headers=headers)
                else:
                    query = urllib.parse.urlencode(params)
                    path = f"{self.path}?{query}"
                    headers["Connection"] = "keep-alive"
                    conn.request("GET", path, headers=headers)

                resp = conn.getresponse()
                data = resp.read().decode("utf-8")
                return json.loads(data)
            except Exception as e:
                try:
                    conn.close()
                except Exception:
                    pass
                self._local.conn = None
                if attempt == 1:
                    logger.error(f"[CRUD] Failed communicating with PHP backend after retry: {e}")
                    return None
        return None


_client = FastPHPClient(PHP_STORAGE_URL) if PHP_STORAGE_URL else None


def _php_call(params: Dict[str, Any], method: str = "POST", timeout: int = 15) -> Optional[Dict[str, Any]]:
    if not _client:
        return None
    return _client.call(params, method=method, timeout=timeout)


# ─────────────────────────────────────────────────────────────
# User & Session CRUD via External PHP Server
# ─────────────────────────────────────────────────────────────
def register_user(
    username: str,
    password: str,
    display_name: Optional[str] = None,
    avatar: Optional[str] = None,
    passkey: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """Register a new user account directly on external PHP server."""
    username = username.strip().lower()
    password = password.strip()

    if len(username) < 2:
        return None, None, "Username must be at least 2 characters long."
    if len(password) < 4:
        return None, None, "Password must be at least 4 characters long."

    payload = {
        "action": "register",
        "username": username,
        "password": password,
        "display_name": (display_name or "").strip() or username.capitalize(),
        "avatar": (avatar or "").strip() or f"https://api.dicebear.com/7.x/bottts/svg?seed={username}",
        "passkey": str(passkey).strip() if passkey else None,
    }

    resp = _php_call(payload, method="POST")
    if not resp:
        return None, None, "External authentication service unreachable."

    if resp.get("status") == "ok":
        return resp.get("user"), resp.get("token"), None
    return None, None, resp.get("message") or "Registration failed."


def authenticate_user(username: str, password: str) -> Tuple[Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """Verify user credentials directly on external PHP server."""
    username = username.strip().lower()
    password = password.strip()

    if not username or not password:
        return None, None, "Please enter both username and password."

    payload = {
        "action": "login",
        "username": username,
        "password": password,
    }

    resp = _php_call(payload, method="POST")
    if not resp:
        return None, None, "External authentication service unreachable."

    if resp.get("status") == "ok":
        return resp.get("user"), resp.get("token"), None
    return None, None, resp.get("message") or "Invalid credentials."


def verify_session_token(token: str) -> Optional[Dict[str, Any]]:
    """Validate session token directly with external PHP server."""
    if not token or len(token) < 16:
        return None

    resp = _php_call({"action": "session_verify", "token": token}, method="GET")
    if resp and resp.get("status") == "ok" and resp.get("user"):
        return resp["user"]
    return None


def delete_session(token: str) -> bool:
    """Revoke session on external PHP server."""
    if not token:
        return False
    resp = _php_call({"action": "logout", "token": token}, method="GET")
    return bool(resp and resp.get("status") == "ok")


def set_user_passkey(username: str, passkey: str) -> bool:
    """Set or update 4-digit PIN passkey on external PHP server."""
    username = username.strip().lower()
    passkey = str(passkey).strip()
    if not username or len(passkey) != 4 or not passkey.isdigit():
        return False

    resp = _php_call({"action": "set_passkey", "username": username, "passkey": passkey}, method="POST")
    return bool(resp and resp.get("status") == "ok")


def verify_user_passkey(username: str, passkey: str) -> bool:
    """Verify 4-digit PIN passkey on external PHP server."""
    username = username.strip().lower()
    passkey = str(passkey).strip()
    if not username or not passkey:
        return False

    resp = _php_call({"action": "verify_passkey", "username": username, "passkey": passkey}, method="POST")
    return bool(resp and resp.get("status") == "ok" and resp.get("verified"))


def get_user_profile(username: str) -> Optional[Dict[str, Any]]:
    """Retrieve public profile from external PHP server."""
    username = username.strip().lower()
    users = get_all_users()
    for u in users:
        if u.get("username") == username:
            return u
    return None


def update_user_profile(username: str, display_name: Optional[str] = None, avatar: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Update profile on external PHP server."""
    username = username.strip().lower()
    payload = {
        "action": "update_profile",
        "username": username,
        "display_name": (display_name or "").strip(),
        "avatar": (avatar or "").strip(),
    }
    resp = _php_call(payload, method="POST")
    if resp and resp.get("status") == "ok" and resp.get("user"):
        return resp["user"]
    return None


def get_all_users(current_user: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all registered users directly from external PHP server."""
    params = {"action": "get_users"}
    if current_user:
        params["current_user"] = current_user.strip().lower()

    resp = _php_call(params, method="GET")
    if resp and resp.get("status") == "ok" and isinstance(resp.get("users"), list):
        return resp["users"]
    return []


# ─────────────────────────────────────────────────────────────
# Presence Tracking via External PHP Server
# ─────────────────────────────────────────────────────────────
def update_user_presence(user_key: str, last_seen_str: Optional[str] = None) -> bool:
    """Sync presence to external PHP server."""
    if not user_key:
        return False
    user_key = user_key.strip().lower()
    if not last_seen_str:
        last_seen_str = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

    resp = _php_call({"action": "presence_update", "user": user_key, "last_seen": last_seen_str}, method="POST", timeout=6)
    return bool(resp and resp.get("status") == "ok")


def get_user_presence(user_key: str) -> Optional[str]:
    """Retrieve last seen from external PHP server."""
    if not user_key:
        return None
    user_key = user_key.strip().lower()
    resp = _php_call({"action": "presence_get", "user": user_key}, method="GET", timeout=6)
    if resp and resp.get("status") == "ok":
        return resp.get("last_seen")
    return None


# ─────────────────────────────────────────────────────────────
# Messages Storage & Targeted Safe Deletion via External PHP Server
# ─────────────────────────────────────────────────────────────
def save_message(
    sender: str,
    recipient: str,
    msg_type: str,
    text_content: Optional[str] = None,
    media_duration: Optional[float] = None,
    client_time: Optional[str] = None,
    seen: bool = False,
    reply_to: Optional[Any] = None,
    client_msg_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Save message directly to external PHP server."""
    sender = sender.strip().lower()
    recipient = recipient.strip().lower()

    payload = {
        "sender": sender,
        "recipient": recipient,
        "msg_type": msg_type,
        "text_content": text_content,
        "audio": text_content if msg_type == "voice" else None,
        "image": text_content if msg_type == "image" else None,
        "media_duration": media_duration,
        "client_time": client_time,
        "seen": seen,
        "reply_to": reply_to,
        "client_msg_id": client_msg_id,
    }

    resp = _php_call(payload, method="POST", timeout=20)
    if resp and resp.get("status") == "ok" and "data" in resp:
        return resp["data"]

    return {
        "sender": sender,
        "recipient": recipient,
        "msg_type": msg_type,
        "text_content": text_content,
        "media_duration": media_duration,
        "client_time": client_time,
        "seen": seen,
        "reply_to": reply_to,
        "client_msg_id": client_msg_id,
    }


def mark_messages_seen(sender: str, recipient: str, msg_ids: Optional[List[Any]] = None) -> bool:
    """Mark messages seen on external PHP server."""
    payload = {
        "action": "seen",
        "sender": sender.strip().lower(),
        "recipient": recipient.strip().lower(),
        "ids": msg_ids or [],
    }
    resp = _php_call(payload, method="POST", timeout=8)
    return bool(resp and resp.get("status") == "ok")


def get_conversation(user1: str, user2: str, limit: int = 250) -> List[Dict[str, Any]]:
    """Retrieve message history directly from external PHP server."""
    user1 = user1.strip().lower()
    user2 = user2.strip().lower()

    resp = _php_call({"action": "get", "user1": user1, "user2": user2}, method="GET", timeout=12)
    if resp and resp.get("status") == "ok" and isinstance(resp.get("messages"), list):
        return resp["messages"]
    return []


def clear_conversation(user1: str, user2: str) -> Tuple[bool, int]:
    """
    SAFELY clear conversation messages ONLY between user1 and user2 on external PHP server.
    CRITICAL: Protects against clearing other users' chats or entire database!
    Both participants must be strictly provided.
    """
    user1 = (user1 or "").strip().lower()
    user2 = (user2 or "").strip().lower()

    if not user1 or not user2:
        logger.warning(f"[CRUD] clear_conversation aborted: both participants required (user1='{user1}', user2='{user2}')")
        return False, 0

    payload = {
        "action": "clear",
        "user1": user1,
        "user2": user2,
    }

    resp = _php_call(payload, method="POST", timeout=12)
    if resp and resp.get("status") == "ok":
        deleted_count = resp.get("deleted_count", 0)
        logger.info(f"[CRUD] Cleared conversation between {user1} and {user2} on external server (deleted: {deleted_count})")
        return True, deleted_count

    return False, 0
