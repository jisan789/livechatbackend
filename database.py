"""
Backwards-compatibility facade for LiveChat database module.
Delegates directly to modular app.crud and app.auth.
"""

from app.database import init_db
from app.crud import (
    register_user,
    authenticate_user,
    delete_session,
    verify_session_token as verify_session,
    set_user_passkey,
    verify_user_passkey,
    get_user_profile,
    update_user_profile,
    get_all_users,
    update_user_presence as update_user_last_seen,
    get_user_presence as get_user_last_seen,
    save_message,
    mark_messages_seen,
    get_conversation,
    clear_conversation,
)


def clear_messages(user1=None, user2=None) -> bool:
    """
    Safely clear messages between two users directly on external server.
    CRITICAL: Never clears all messages or the entire database.
    Both users must be specified.
    """
    if not user1 or not user2:
        return False
    ok, _ = clear_conversation(user1, user2)
    return ok


__all__ = [
    "init_db",
    "verify_session",
    "register_user",
    "authenticate_user",
    "delete_session",
    "set_user_passkey",
    "verify_user_passkey",
    "get_user_profile",
    "update_user_profile",
    "get_all_users",
    "update_user_last_seen",
    "get_user_last_seen",
    "save_message",
    "mark_messages_seen",
    "get_conversation",
    "clear_messages",
    "clear_conversation",
]
