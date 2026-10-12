import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent

# External PHP Receiver URL (Primary source of truth for all data & storage)
PHP_STORAGE_URL = os.environ.get("PHP_STORAGE_URL", "https://cdn.jisanfx.top/chatdatabase/reciever.php").strip()

# Cookie and session settings
SESSION_COOKIE_NAME = "chat_session"
COOKIE_MAX_AGE = 90 * 24 * 60 * 60  # 90 days in seconds
SESSION_EXPIRY_DAYS = 90

# API Metadata
API_TITLE = "LiveChat Backend API & Real-Time Gateway"
API_VERSION = "2.0.0"
API_DESCRIPTION = (
    "High-performance pure backend server for real-time messaging, presence tracking, "
    "live keystroke streaming, live typing, passkey authentication, and chat settings management."
)
