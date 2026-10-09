import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = BASE_DIR / "index.html"

# External PHP Receiver URL (Primary source of truth for all data & storage)
PHP_STORAGE_URL = os.environ.get("PHP_STORAGE_URL", "https://cdn.jisanfx.top/chatdatabase/reciever.php").strip()

# Cookie and session settings
SESSION_COOKIE_NAME = "chat_session"
COOKIE_MAX_AGE = 90 * 24 * 60 * 60  # 90 days in seconds
SESSION_EXPIRY_DAYS = 90
