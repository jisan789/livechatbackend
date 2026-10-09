// LiveChat — Modern Modular ES6 Application Root
// High-performance orchestration layer: Google/Facebook/Gemini grade architecture

import { state, setActiveUser } from './state.js';
import { APP_CONFIG } from './config.js';
import { $, showToast } from './utils/dom.js';
import { initSoundMuteState, loadKeypressSounds, playOpponentKeypressSound } from './utils/audio.js';
import { connectWebSocket, onWebSocketMessage } from './services/websocket.js';
import {
  initPinKeypadEvents,
  isPinConfiguredForUser,
  isPinLockEnabledForUser,
  showPinOverlay
} from './modules/pin-lock.js';
import { initAuthEvents, showAuthOverlay, onLoginSuccess } from './modules/auth.js';
import {
  initChatsListEvents,
  refreshUsersList,
  setOnSelectChat,
  renderChatsList,
  updateUserTypingOnList
} from './modules/chats-list.js';
import {
  initConversationEvents,
  openConversationView,
  appendMessage,
  appendImageMessage,
  showOpponentTyping,
  hideOpponentTyping,
  markOutgoingMessagesSeen
} from './modules/conversation.js';
import { receiveIncomingVoice } from './modules/voice.js';
import { initMediaEvents } from './modules/media.js';
import { initReactionsEvents, createFlyingBalloon } from './modules/reactions.js';
import { initProfileEvents } from './modules/profile.js';
import { initDirectoryEvents } from './modules/directory.js';

// ─────────────────────────────────────────────────────────────
// Real-Time Incoming WebSocket Message Handler
// ─────────────────────────────────────────────────────────────
function handleIncomingWsMessage(msg) {
  switch (msg.type) {
    // ── Direct Chat Message ──
    case 'chat': {
      if (state.currentPartner && msg.from === state.currentPartner.key && state.currentView === 'conversation') {
        playOpponentKeypressSound();
        appendMessage(msg.text, 'incoming', msg.time, msg.id, false, false, msg.reply_to);
      } else {
        const u = state.registeredUsersList.find(item => item.username === msg.from);
        if (u) {
          u.last_message = { text_content: msg.text, msg_type: 'chat', client_time: msg.time, seen: false, sender: msg.from };
          renderChatsList();
        }
        showToast(`New message from ${u ? u.display_name : msg.from}`, 'info');
      }
      break;
    }

    // ── Voice Message ──
    case 'voice': {
      const voiceSrc = msg.audio || msg.text || msg.text_content;
      const voiceDur = msg.duration || msg.media_duration || 1;
      const voiceTime = msg.time || msg.client_time;
      const voiceId = msg.id || msg.client_msg_id;

      if (state.currentPartner && msg.from === state.currentPartner.key && state.currentView === 'conversation') {
        receiveIncomingVoice(voiceSrc, voiceDur, voiceTime, voiceId, msg.waveform, msg.reply_to);
      } else {
        const u = state.registeredUsersList.find(item => item.username === msg.from);
        if (u) {
          u.last_message = { msg_type: 'voice', text_content: 'Voice note', client_time: voiceTime, seen: false, sender: msg.from };
          renderChatsList();
        }
        showToast(`Voice note from ${u ? u.display_name : msg.from}`, 'info');
      }
      break;
    }

    // ── Image Message ──
    case 'image': {
      const imgSrc = msg.image || msg.text_content || msg.text;
      if (state.currentPartner && msg.from === state.currentPartner.key && state.currentView === 'conversation') {
        playOpponentKeypressSound();
        appendImageMessage(imgSrc, 'incoming', msg.time, msg.id, false, false, msg.reply_to);
      } else {
        const u = state.registeredUsersList.find(item => item.username === msg.from);
        if (u) {
          u.last_message = { msg_type: 'image', text_content: 'Image', client_time: msg.time, seen: false, sender: msg.from };
          renderChatsList();
        }
        showToast(`Image from ${u ? u.display_name : msg.from}`, 'info');
      }
      break;
    }

    // ── Live Keystroke Audio ──
    case 'live_typing': {
      if (state.currentPartner && msg.from === state.currentPartner.key && state.currentView === 'conversation') {
        playOpponentKeypressSound();
      }
      updateUserTypingOnList(msg.from, Boolean(msg.text && msg.text.length > 0));
      break;
    }

    case 'typing_start': {
      if (state.currentPartner && msg.from === state.currentPartner.key && state.currentView === 'conversation') {
        showOpponentTyping();
      }
      updateUserTypingOnList(msg.from, true);
      break;
    }

    case 'typing_stop': {
      if (state.currentPartner && msg.from === state.currentPartner.key && state.currentView === 'conversation') {
        hideOpponentTyping();
      }
      updateUserTypingOnList(msg.from, false);
      break;
    }

    // ── Seen Status ──
    case 'seen':
    case 'mark_seen': {
      markOutgoingMessagesSeen(msg.msg_id || msg.id, msg.ids, msg.all);
      break;
    }

    // ── Flying Emoji ──
    case 'flying_emoji': {
      if (Date.now() - state.lastIncomingEmojiTime >= 2000) {
        state.lastIncomingEmojiTime = Date.now();
        createFlyingBalloon(msg.emoji);
      }
      break;
    }

    // ── Presence / Online Sync ──
    case 'presence': {
      if (msg.user) {
        const target = state.registeredUsersList.find(u => u.username.toLowerCase() === msg.user.toLowerCase());
        if (target) {
          target.is_online = (msg.status === 'online');
          target.last_seen = msg.last_seen;
          renderChatsList();
        }
      }
      break;
    }

    case 'ws_connected': {
      refreshUsersList();
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Application Bootstrapper
// ─────────────────────────────────────────────────────────────
async function bootstrapApp() {
  // 1. Initialize Sound & Keypress Assets
  initSoundMuteState();
  loadKeypressSounds();

  // 2. Initialize Module Event Handlers
  initPinKeypadEvents();
  initChatsListEvents();
  initConversationEvents();
  initMediaEvents();
  initReactionsEvents();
  initProfileEvents();
  initDirectoryEvents();

  // 3. Register WebSocket Incoming Dispatcher
  onWebSocketMessage(handleIncomingWsMessage);

  // 4. Wire Chat Card Click to Conversation View
  setOnSelectChat(() => {
    openConversationView();
  });

  // 5. App Lock Button
  const lockBtn = $('chatsLockAppBtn');
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      if (state.activeUser && isPinConfiguredForUser(state.activeUser)) {
        showPinOverlay();
      } else {
        showToast('Set up a passcode in Profile settings first', 'info');
      }
    });
  }

  // 6. Initialize Auth Form Handlers
  initAuthEvents(() => {
    refreshUsersList();
  });

  // 7. Check Existing Active Session
  const savedSession = localStorage.getItem(APP_CONFIG.SESSION_STORAGE_KEY);
  if (savedSession) {
    try {
      const user = JSON.parse(savedSession);
      if (user && user.username) {
        setActiveUser(user.username, user);
        connectWebSocket(user.username);

        const avatarEl = $('chatsUserAvatar');
        const subtitleEl = $('chatsUserSubtitle');
        if (avatarEl) avatarEl.src = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`;
        if (subtitleEl) subtitleEl.textContent = `@${user.username}`;

        // Verify if passcode lock is required
        const hasPin = isPinConfiguredForUser(user.username);
        const pinEnabled = isPinLockEnabledForUser(user.username);
        if (hasPin && pinEnabled) {
          showPinOverlay();
        }

        refreshUsersList();
        return;
      }
    } catch (_) {}
  }

  // If no valid session, display authentication overlay
  showAuthOverlay();
}

// Bootstrap on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
