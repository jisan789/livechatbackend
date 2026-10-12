from typing import Optional, List, Any, Union
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=30, description="Unique username identifier", example="jisan")
    password: str = Field(..., min_length=3, max_length=128, description="Account password", example="Secret123!")
    display_name: Optional[str] = Field(None, max_length=50, description="Public display name", example="Jisan Ahmed")
    avatar: Optional[str] = Field(None, description="Avatar image URL or data URL", example="https://api.dicebear.com/7.x/bottts/svg?seed=jisan")
    passkey: Optional[str] = Field(None, description="Optional 4-digit PIN for quick biometric/passcode unlock", example="1234")


class LoginRequest(BaseModel):
    username: str = Field(..., description="Account username", example="jisan")
    password: str = Field(..., description="Account password", example="Secret123!")


class PasskeySetupRequest(BaseModel):
    passkey: str = Field(..., min_length=4, max_length=4, description="4-digit numeric passcode PIN", example="1234")
    username: Optional[str] = Field(None, description="Optional username if session cookie is not used", example="jisan")


class PasskeyVerifyRequest(BaseModel):
    username: str = Field(..., description="Username to verify passkey for", example="jisan")
    passkey: str = Field(..., min_length=4, max_length=4, description="4-digit numeric passcode PIN", example="1234")


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = Field(None, max_length=50, description="Updated display name", example="Jisan Ahmed")
    avatar: Optional[str] = Field(None, description="Updated avatar image URL", example="https://api.dicebear.com/7.x/bottts/svg?seed=Nova")


class SendMessageRequest(BaseModel):
    recipient: str = Field(..., description="Recipient username", example="alice")
    msg_type: str = Field("chat", description="Message type: 'chat', 'voice', or 'image'", example="chat")
    text_content: Optional[str] = Field(None, description="Message text or media payload (data URL or CDN link)", example="Hello, how are you?")
    media_duration: Optional[float] = Field(None, description="Duration in seconds (for voice messages)", example=3.5)
    client_time: Optional[str] = Field(None, description="Client ISO timestamp or formatted time", example="10:45 AM")
    client_msg_id: Optional[str] = Field(None, description="Client-generated unique message UUID", example="msg_1728000000_123")
    reply_to: Optional[Any] = Field(None, description="Quoted message object for reply previews")


class MarkSeenRequest(BaseModel):
    sender: Optional[str] = Field(None, description="Sender of the messages (opponent)", example="alice")
    recipient: Optional[str] = Field(None, description="Recipient of the messages (current user)", example="jisan")
    ids: Optional[List[Union[int, str]]] = Field(None, description="Specific message IDs to mark as seen", example=[101, 102])
    all: Optional[bool] = Field(False, description="Whether to mark all unread messages from this sender as seen", example=True)


class ClearChatRequest(BaseModel):
    opponent: str = Field(..., description="Target opponent username whose conversation history will be cleared", example="alice")
    user1: Optional[str] = Field(None, description="Optional current user username if not using session token", example="jisan")


class GenericResponse(BaseModel):
    status: str = Field("ok", example="ok")
    message: Optional[str] = Field(None, example="Operation completed successfully")
