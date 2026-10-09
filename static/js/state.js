// LiveChat — Centralized Application State
// Maintains shared runtime state cleanly across all modular components

export const state = {
  // Authentication & Profile
  activeUser: null,            // Currently logged in username
  currentUserProfile: null,     // { username, display_name, avatar, pin_enabled }

  // Active Chat Session
  currentPartner: {
    key: null,
    name: 'Opponent',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=user',
    online: false,
    lastSeen: null
  },
  currentView: 'chats',         // 'chats' | 'conversation'
  isOpponentOnline: false,

  // Users Directory & Contacts
  registeredUsersList: [],

  // WebSocket Connection
  ws: null,
  wsReconnectTimer: null,
  wsReconnectDelay: 1000,
  isManualDisconnect: false,
  offlineQueue: [],

  // Audio / Sound
  isMuted: false,

  // PIN Lock & Passcode
  isAppLocked: false,
  pinEntered: '',
  passkeySetupEntered: '',
  passkeySetupFirst: null,

  // Conversation & Messaging
  lastConversationMessage: null,
  activeReplyContext: null,
  currentlyPlayingVoiceAudio: null,
  currentlyPlayingVoiceReset: null,
  lastIncomingEmojiTime: 0,

  // Typing state
  typingStopTimer: null,
  isTypingSent: false,
  opponentTypingTimer: null,
  lastLiveTypingSentText: ''
};

// State helper methods
export function setActiveUser(username, profile = null) {
  state.activeUser = username ? username.trim().toLowerCase() : null;
  state.currentUserProfile = profile;
}

export function setCurrentPartner(partnerData) {
  state.currentPartner = {
    key: (partnerData.key || partnerData.username || '').trim().toLowerCase(),
    name: partnerData.name || partnerData.display_name || 'Opponent',
    avatar: partnerData.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=user',
    online: Boolean(partnerData.online),
    lastSeen: partnerData.lastSeen || null
  };
}

export function setReplyContext(context) {
  state.activeReplyContext = context;
}

export function clearReplyContext() {
  state.activeReplyContext = null;
}
