// LiveChat — Conversation Screen & Messaging Module
// Handles chat messages, real-time typing indicators, delivery checkmarks, and swipe-to-reply

import { state } from '../state.js';
import { APP_CONFIG, MIC_ICON_SVG, SEND_ICON_SVG } from '../config.js';
import { $, $$, escapeHtml, formatCurrentTime, formatTimeFromIso } from '../utils/dom.js';
import { fetchConversation, postMarkSeen } from '../services/api.js';
import { wsSend } from '../services/websocket.js';
import { playOpponentKeypressSound } from '../utils/audio.js';
import { appendVoiceMessage } from './voice.js';
import { updateChatsListCardUI } from './chats-list.js';

let replyPreviewBar = null;

export function openConversationView() {
  const chatsScreen = $('chatsScreen');
  const convScreen = $('conversationScreen');
  if (chatsScreen) chatsScreen.classList.remove('active');
  if (convScreen) convScreen.classList.add('active');

  state.currentView = 'conversation';
  updateHeaderPartnerUI();
  loadChatHistory(state.currentPartner.key);

  const chatInput = $('chatInput');
  if (chatInput) {
    setTimeout(() => {
      chatInput.focus({ preventScroll: true });
    }, 150);
  }
}

export function closeConversationView() {
  const chatsScreen = $('chatsScreen');
  const convScreen = $('conversationScreen');
  if (convScreen) convScreen.classList.remove('active');
  if (chatsScreen) chatsScreen.classList.add('active');

  state.currentView = 'chats';
  const chatInput = $('chatInput');
  if (chatInput) chatInput.blur();
}

export function updateHeaderPartnerUI() {
  const avatarImg = $('avatarImg');
  const userName = $('userName');
  const userStatus = $('userStatus');
  const badge = document.querySelector('.avatar-badge');

  if (avatarImg) avatarImg.src = state.currentPartner.avatar;
  if (userName) userName.textContent = state.currentPartner.name;
  if (userStatus) {
    userStatus.textContent = state.currentPartner.online ? 'Online' : 'Offline';
    userStatus.classList.toggle('online', state.currentPartner.online);
  }
  if (badge) {
    badge.classList.toggle('online', state.currentPartner.online);
  }
}

export async function loadChatHistory(opponent) {
  if (!opponent) return;
  const chatMessages = $('chatMessages');
  if (!chatMessages) return;

  // Clear previous messages except typingIndicator
  const typingIndicator = $('typingIndicator');
  chatMessages.querySelectorAll('.message-row').forEach(row => row.remove());

  try {
    const messages = await fetchConversation(opponent);
    messages.forEach(msg => {
      const isOutgoing = (msg.sender && state.activeUser && msg.sender.toLowerCase() === state.activeUser.toLowerCase());
      const type = isOutgoing ? 'outgoing' : 'incoming';
      const timeStr = msg.client_time || formatTimeFromIso(msg.created_at);
      const assignedId = msg.client_msg_id || ('msg_' + msg.id);
      const deliveryStatus = msg.seen ? 'seen' : 'delivered';

      let replyData = msg.reply_to;
      if (typeof replyData === 'string') {
        try { replyData = JSON.parse(replyData); } catch (_) {}
      }

      if (msg.msg_type === 'chat') {
        appendMessage(msg.text_content, type, timeStr, assignedId, deliveryStatus, true, replyData);
      } else if (msg.msg_type === 'voice' && (msg.text_content || msg.audio)) {
        appendVoiceMessage(msg.audio || msg.text_content, msg.media_duration || 1, type, timeStr, assignedId, null, deliveryStatus, true, replyData);
      } else if (msg.msg_type === 'image' && (msg.text_content || msg.image)) {
        appendImageMessage(msg.image || msg.text_content, type, timeStr, assignedId, deliveryStatus, true, replyData);
      }
    });

    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Mark seen on server
    postMarkSeen(opponent, null, true);
    wsSend({ type: 'seen', to: opponent, all: true });
  } catch (e) {
    console.warn('[Conversation] Failed to load messages:', e);
  }
}

export function appendMessage(text, type = 'outgoing', timeStr = null, messageId = null, isSeenOrStatus = false, skipScroll = false, replyTo = null) {
  const chatMessages = $('chatMessages');
  const typingIndicator = $('typingIndicator');
  if (!chatMessages || !text) return;

  const assignedId = messageId || ('msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  const isSeen = (isSeenOrStatus === true || isSeenOrStatus === 'seen');
  const statusStr = typeof isSeenOrStatus === 'string' ? isSeenOrStatus : (isSeen ? 'seen' : 'sent');

  state.lastConversationMessage = {
    text: text,
    msg_type: 'chat',
    time: timeStr || formatCurrentTime(),
    isOutgoing: type === 'outgoing',
    isSeen: isSeen
  };
  updateChatsListCardUI();

  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${type}`;
  messageRow.dataset.msgId = assignedId;

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (replyTo) {
    const quote = document.createElement('div');
    quote.className = 'reply-quote';
    quote.innerHTML = `<span class="reply-sender">${escapeHtml(replyTo.sender || 'Opponent')}</span><span class="reply-text">${escapeHtml(replyTo.text || '')}</span>`;
    bubble.appendChild(quote);
  }

  const textEl = document.createElement('span');
  textEl.className = 'bubble-text';
  textEl.textContent = text;
  bubble.appendChild(textEl);

  if (type === 'outgoing') {
    const statusWrap = document.createElement('div');
    statusWrap.className = 'msg-status-wrap';
    statusWrap.innerHTML = `
      <span class="status-icon ${statusStr}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>`;
    bubble.appendChild(statusWrap);
  }

  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = timeStr || formatCurrentTime();

  bubbleGroup.appendChild(bubble);
  messageRow.appendChild(bubbleGroup);
  messageRow.appendChild(timeEl);

  chatMessages.insertBefore(messageRow, typingIndicator);
  if (!skipScroll) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

export function appendImageMessage(imageUrl, type = 'outgoing', timeStr = null, messageId = null, isSeenOrStatus = false, skipScroll = false, replyTo = null) {
  const chatMessages = $('chatMessages');
  const typingIndicator = $('typingIndicator');
  if (!chatMessages || !imageUrl) return;

  const assignedId = messageId || ('img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  const isSeen = (isSeenOrStatus === true || isSeenOrStatus === 'seen');
  const statusStr = typeof isSeenOrStatus === 'string' ? isSeenOrStatus : (isSeen ? 'seen' : 'sent');

  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${type}`;
  messageRow.dataset.msgId = assignedId;

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble bubble-image';

  const img = document.createElement('img');
  img.src = imageUrl;
  img.alt = 'Shared image';
  img.className = 'chat-bubble-img';
  img.addEventListener('click', () => {
    import('./media.js').then(m => m.openImageLightbox(imageUrl));
  });

  bubble.appendChild(img);

  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = timeStr || formatCurrentTime();

  bubbleGroup.appendChild(bubble);
  messageRow.appendChild(bubbleGroup);
  messageRow.appendChild(timeEl);

  chatMessages.insertBefore(messageRow, typingIndicator);
  if (!skipScroll) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

export function sendTextMessage() {
  const input = $('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const clientTime = formatCurrentTime();
  const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const replyPayload = state.activeReplyContext ? { ...state.activeReplyContext } : null;
  state.activeReplyContext = null;
  clearReplyUI();

  appendMessage(text, 'outgoing', clientTime, clientMsgId, false, false, replyPayload);

  input.value = '';
  updateActionBtnState();

  const payload = {
    type: 'chat',
    text: text,
    time: clientTime,
    id: clientMsgId
  };
  if (replyPayload) payload.reply_to = replyPayload;
  wsSend(payload, true);

  // Stop typing broadcast
  broadcastTypingStop();
}

export function handleInputKeypress(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
    return;
  }

  // Live typing keystroke broadcast
  broadcastLiveTyping();
}

export function broadcastLiveTyping() {
  const input = $('chatInput');
  if (!input || !state.currentPartner.key) return;

  const val = input.value;
  wsSend({ type: 'live_typing', text: val });

  clearTimeout(state.typingStopTimer);
  state.typingStopTimer = setTimeout(broadcastTypingStop, APP_CONFIG.TYPING_STOP_TIMEOUT_MS);
}

export function broadcastTypingStop() {
  if (!state.currentPartner.key) return;
  wsSend({ type: 'typing_stop' });
}

export function showOpponentTyping() {
  const typingIndicator = $('typingIndicator');
  if (typingIndicator) typingIndicator.style.display = 'flex';
}

export function hideOpponentTyping() {
  const typingIndicator = $('typingIndicator');
  if (typingIndicator) typingIndicator.style.display = 'none';
}

export function markOutgoingMessagesSeen(msgId, ids = null, all = false) {
  const rows = ids || (msgId ? [msgId] : []);
  if (all) {
    $$('.message-row.outgoing .status-icon').forEach(icon => {
      icon.className = 'status-icon seen';
    });
    return;
  }
  rows.forEach(id => {
    const row = document.querySelector(`.message-row[data-msg-id="${id}"]`);
    if (row) {
      const icon = row.querySelector('.status-icon');
      if (icon) icon.className = 'status-icon seen';
    }
  });
}

export function updateActionBtnState() {
  const input = $('chatInput');
  const actionIcon = $('actionIcon');
  if (!input || !actionIcon) return;

  if (input.value.trim().length > 0) {
    actionIcon.innerHTML = SEND_ICON_SVG;
  } else {
    actionIcon.innerHTML = MIC_ICON_SVG;
  }
}

export function clearReplyUI() {
  if (replyPreviewBar) {
    replyPreviewBar.remove();
    replyPreviewBar = null;
  }
}

export function initConversationEvents() {
  const backBtn = $('chatBackBtn');
  const input = $('chatInput');
  const actionBtn = $('actionBtn');

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      closeConversationView();
    });
  }

  if (input) {
    input.addEventListener('keydown', handleInputKeypress);
    input.addEventListener('input', () => {
      updateActionBtnState();
      broadcastLiveTyping();
    });
  }

  if (actionBtn) {
    actionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (input && input.value.trim().length > 0) {
        sendTextMessage();
      } else {
        import('./voice.js').then(m => m.startVoiceRecording());
      }
    });
  }

  const cancelRecordBtn = $('cancelRecordBtn');
  if (cancelRecordBtn) {
    cancelRecordBtn.addEventListener('click', () => {
      import('./voice.js').then(m => m.cancelVoiceRecording());
    });
  }
}
