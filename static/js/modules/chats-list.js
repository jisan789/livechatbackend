// LiveChat — Chats List Screen Module
// Displays registered contacts, search filtering, last messages, and online status

import { state, setCurrentPartner } from '../state.js';
import { $, $$, escapeHtml, formatLastSeen } from '../utils/dom.js';
import { fetchUsers } from '../services/api.js';

let onSelectChatCallback = null;

export function setOnSelectChat(callback) {
  onSelectChatCallback = callback;
}

export async function refreshUsersList() {
  try {
    const users = await fetchUsers();
    state.registeredUsersList = users || [];
    renderChatsList();
  } catch (e) {
    console.warn('[Chats] Failed to fetch users:', e);
  }
}

export function renderChatsList() {
  const container = $('chatsListContainer');
  const emptyState = $('chatsEmptyState');
  const badge = $('chatsCountBadge');
  const searchInput = $('chatsSearchInput');
  if (!container) return;

  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

  const filtered = state.registeredUsersList.filter(u => {
    if (state.activeUser && u.username.toLowerCase() === state.activeUser.toLowerCase()) {
      return false; // Don't list oneself as a chat recipient
    }
    if (!query) return true;
    return (
      u.username.toLowerCase().includes(query) ||
      (u.display_name && u.display_name.toLowerCase().includes(query))
    );
  });

  if (badge) {
    badge.textContent = `${filtered.length}`;
    badge.style.display = filtered.length > 0 ? 'inline-flex' : 'none';
  }

  container.innerHTML = '';

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  filtered.forEach(u => {
    const card = createChatCardElement(u);
    container.appendChild(card);
  });
}

function createChatCardElement(user) {
  const card = document.createElement('div');
  card.className = 'chat-card-item';
  card.dataset.username = user.username;

  const isOnline = Boolean(user.is_online);
  const isSelected = state.currentPartner && state.currentPartner.key === user.username.toLowerCase();
  if (isSelected) card.classList.add('active');

  const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`;
  const displayName = user.display_name || user.username;

  let lastMsgSnippet = 'Tap to chat';
  let lastMsgTime = '';

  if (user.last_message) {
    const lm = user.last_message;
    if (lm.msg_type === 'voice') {
      lastMsgSnippet = '🎙️ Voice note';
    } else if (lm.msg_type === 'image') {
      lastMsgSnippet = '📷 Image';
    } else {
      lastMsgSnippet = lm.text_content || lm.text || 'Message';
    }
    lastMsgTime = lm.client_time || '';
  }

  card.innerHTML = `
    <div class="chat-card-avatar-wrap">
      <img class="chat-card-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}">
      <span class="chat-card-status-dot ${isOnline ? 'online' : 'offline'}"></span>
    </div>
    <div class="chat-card-info">
      <div class="chat-card-top-row">
        <span class="chat-card-name">${escapeHtml(displayName)}</span>
        <span class="chat-card-time">${escapeHtml(lastMsgTime)}</span>
      </div>
      <div class="chat-card-bottom-row">
        <span class="chat-card-snippet ${user.is_typing ? 'typing-snippet' : ''}">
          ${user.is_typing ? 'typing...' : escapeHtml(lastMsgSnippet)}
        </span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => {
    setCurrentPartner({
      key: user.username,
      name: displayName,
      avatar: avatarUrl,
      online: isOnline,
      lastSeen: user.last_seen
    });

    // Mark active in list
    $$('.chat-card-item', $('chatsListContainer')).forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    if (onSelectChatCallback) {
      onSelectChatCallback(user);
    }
  });

  return card;
}

export function updateChatsListCardUI() {
  if (!state.currentPartner || !state.currentPartner.key) return;
  const card = document.querySelector(`.chat-card-item[data-username="${state.currentPartner.key}"]`);
  if (!card) return;

  const snippetEl = card.querySelector('.chat-card-snippet');
  const timeEl = card.querySelector('.chat-card-time');

  if (state.lastConversationMessage) {
    if (snippetEl) {
      const lm = state.lastConversationMessage;
      snippetEl.textContent = lm.msg_type === 'voice' ? '🎙️ Voice note' : (lm.msg_type === 'image' ? '📷 Image' : (lm.text || ''));
    }
    if (timeEl && state.lastConversationMessage.time) {
      timeEl.textContent = state.lastConversationMessage.time;
    }
  }
}

export function updateUserTypingOnList(userKey, isTyping) {
  if (!userKey) return;
  const user = state.registeredUsersList.find(u => u.username.toLowerCase() === userKey.toLowerCase());
  if (user) {
    user.is_typing = Boolean(isTyping);
  }
  const card = document.querySelector(`.chat-card-item[data-username="${userKey}"]`);
  if (card) {
    const snippetEl = card.querySelector('.chat-card-snippet');
    if (snippetEl) {
      snippetEl.classList.toggle('typing-snippet', Boolean(isTyping));
      if (isTyping) {
        snippetEl.textContent = 'typing...';
      } else if (user && user.last_message) {
        const lm = user.last_message;
        snippetEl.textContent = lm.msg_type === 'voice' ? '🎙️ Voice note' : (lm.text_content || lm.text || 'Tap to chat');
      } else {
        snippetEl.textContent = 'Tap to chat';
      }
    }
  }
}

export function initChatsListEvents() {
  const searchInput = $('chatsSearchInput');
  const searchClear = $('chatsSearchClearBtn');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderChatsList();
      if (searchClear) searchClear.style.display = searchInput.value ? 'block' : 'none';
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.style.display = 'none';
      renderChatsList();
    });
  }
}
