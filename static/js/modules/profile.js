// LiveChat — Profile & Settings Sheet Module
// Handles user avatar changes, display name update, and logout

import { state, setActiveUser } from '../state.js';
import { APP_CONFIG, AVATAR_PRESETS } from '../config.js';
import { $, showToast } from '../utils/dom.js';
import { updateProfile, postLogout } from '../services/api.js';
import { disconnectWebSocket } from '../services/websocket.js';
import { showAuthOverlay } from './auth.js';
import { openPasskeySetupModal } from './pin-lock.js';

let selectedProfileAvatar = null;

export function openProfileModal() {
  const modal = $('profileModal');
  if (!modal) return;

  const profile = state.currentUserProfile || { username: state.activeUser, display_name: state.activeUser };
  const currentAvatar = $('profileCurrentAvatar');
  const usernameDisplay = $('profileUsernameDisplay');
  const nameInput = $('profileDisplayNameInput');

  if (currentAvatar) currentAvatar.src = profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.username}`;
  if (usernameDisplay) usernameDisplay.textContent = `@${profile.username || 'user'}`;
  if (nameInput) nameInput.value = profile.display_name || profile.username || '';

  selectedProfileAvatar = profile.avatar;
  renderProfileAvatarPresets();

  modal.style.display = 'flex';
}

export function closeProfileModal() {
  const modal = $('profileModal');
  if (modal) modal.style.display = 'none';
}

function renderProfileAvatarPresets() {
  const container = $('profileAvatarPresets');
  if (!container) return;
  container.innerHTML = '';

  AVATAR_PRESETS.forEach(url => {
    const img = document.createElement('img');
    img.className = 'profile-preset-img' + (url === selectedProfileAvatar ? ' selected' : '');
    img.src = url;
    img.alt = 'Avatar preset';
    img.addEventListener('click', () => {
      container.querySelectorAll('.profile-preset-img').forEach(el => el.classList.remove('selected'));
      img.classList.add('selected');
      selectedProfileAvatar = url;
      const currentAvatar = $('profileCurrentAvatar');
      if (currentAvatar) currentAvatar.src = url;
    });
    container.appendChild(img);
  });
}

export async function saveProfileChanges() {
  const nameInput = $('profileDisplayNameInput');
  const newName = (nameInput ? nameInput.value : '').trim();
  const avatarToSave = selectedProfileAvatar;

  try {
    const res = await updateProfile(newName, avatarToSave);
    if (res && res.user) {
      setActiveUser(res.user.username, res.user);
      localStorage.setItem(APP_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(res.user));

      const avatarEl = $('chatsUserAvatar');
      if (avatarEl) avatarEl.src = res.user.avatar;

      showToast('Profile updated successfully', 'info');
      closeProfileModal();
    }
  } catch (err) {
    showToast('Failed to update profile', 'error');
  }
}

export async function handleLogout() {
  await postLogout();
  disconnectWebSocket();
  localStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
  setActiveUser(null, null);

  closeProfileModal();
  showAuthOverlay();
  showToast('Logged out successfully', 'info');
}

export function initProfileEvents() {
  const trigger = $('chatsHeaderProfileTrigger');
  const closeBtn = $('profileModalCloseBtn');
  const saveBtn = $('profileSaveBtn');
  const logoutBtn = $('profileLogoutBtn');
  const changePasscodeBtn = $('profileChangePasscodeBtn');

  if (trigger) trigger.addEventListener('click', openProfileModal);
  if (closeBtn) closeBtn.addEventListener('click', closeProfileModal);
  if (saveBtn) saveBtn.addEventListener('click', saveProfileChanges);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  if (changePasscodeBtn) {
    changePasscodeBtn.addEventListener('click', () => {
      closeProfileModal();
      openPasskeySetupModal();
    });
  }
}
