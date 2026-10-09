// LiveChat — User Directory Modal Module
// Search and connect with new contacts

import { state, setCurrentPartner } from '../state.js';
import { $, escapeHtml } from '../utils/dom.js';
import { openConversationView } from './conversation.js';

export function openDirectoryModal() {
  const modal = $('usersModal');
  if (!modal) return;
  modal.style.display = 'flex';
  renderDirectoryList();

  const searchInput = $('directorySearchInput');
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 100);
  }
}

export function closeDirectoryModal() {
  const modal = $('usersModal');
  if (modal) modal.style.display = 'none';
}

export function renderDirectoryList() {
  const container = $('usersListContainer');
  const searchInput = $('directorySearchInput');
  if (!container) return;

  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  container.innerHTML = '';

  const filtered = state.registeredUsersList.filter(u => {
    if (state.activeUser && u.username.toLowerCase() === state.activeUser.toLowerCase()) return false;
    if (!query) return true;
    return (
      u.username.toLowerCase().includes(query) ||
      (u.display_name && u.display_name.toLowerCase().includes(query))
    );
  });

  filtered.forEach(user => {
    const item = document.createElement('div');
    item.className = 'directory-user-row';
    const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`;
    const name = user.display_name || user.username;

    item.innerHTML = `
      <img class="directory-user-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}">
      <div class="directory-user-details">
        <span class="directory-user-name">${escapeHtml(name)}</span>
        <span class="directory-user-handle">@${escapeHtml(user.username)}</span>
      </div>
      <button class="directory-chat-btn" type="button">Chat</button>
    `;

    item.addEventListener('click', () => {
      setCurrentPartner({
        key: user.username,
        name: name,
        avatar: avatarUrl,
        online: Boolean(user.is_online),
        lastSeen: user.last_seen
      });
      closeDirectoryModal();
      openConversationView();
    });

    container.appendChild(item);
  });
}

export function initDirectoryEvents() {
  const closeBtn = $('usersModalCloseBtn');
  const searchInput = $('directorySearchInput');
  const emptyNewBtn = $('chatsEmptyNewBtn');

  if (closeBtn) closeBtn.addEventListener('click', closeDirectoryModal);
  if (emptyNewBtn) emptyNewBtn.addEventListener('click', openDirectoryModal);

  if (searchInput) {
    searchInput.addEventListener('input', renderDirectoryList);
  }
}
