// LiveChat — Authentication & Session Management Module
// Handles Login, Registration, and Session Persistence

import { state, setActiveUser } from '../state.js';
import { APP_CONFIG, AVATAR_PRESETS } from '../config.js';
import { $, showToast } from '../utils/dom.js';
import { postLogin, postRegister } from '../services/api.js';
import { connectWebSocket } from '../services/websocket.js';
import {
  isPinConfiguredForUser,
  isPinSetupEverShownForUser,
  isPinLockEnabledForUser,
  showPinOverlay,
  openPasskeySetupModal
} from './pin-lock.js';

let selectedRegisterAvatar = AVATAR_PRESETS[0];

export function showAuthOverlay() {
  const overlay = $('authOverlay');
  if (overlay) overlay.style.display = 'flex';
}

export function hideAuthOverlay() {
  const overlay = $('authOverlay');
  if (overlay) overlay.style.display = 'none';
}

export function switchAuthTab(tab) {
  const tabLogin = $('authTabLogin');
  const tabRegister = $('authTabRegister');
  const formLogin = $('loginForm');
  const formRegister = $('registerForm');
  const loginFeedback = $('loginFeedback');
  const regFeedback = $('regFeedback');

  if (loginFeedback) loginFeedback.textContent = '';
  if (regFeedback) regFeedback.textContent = '';

  if (tab === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
    if (formLogin) formLogin.style.display = 'block';
    if (formRegister) formRegister.style.display = 'none';
  } else {
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabRegister) tabRegister.classList.add('active');
    if (formLogin) formLogin.style.display = 'none';
    if (formRegister) formRegister.style.display = 'block';
  }
}

export function initAvatarPresets() {
  const container = $('regAvatarPresets');
  if (!container) return;
  container.innerHTML = '';

  AVATAR_PRESETS.forEach((url, idx) => {
    const img = document.createElement('img');
    img.className = 'reg-avatar-preset' + (idx === 0 ? ' selected' : '');
    img.src = url;
    img.alt = 'Avatar preset';
    img.addEventListener('click', () => {
      container.querySelectorAll('.reg-avatar-preset').forEach(el => el.classList.remove('selected'));
      img.classList.add('selected');
      selectedRegisterAvatar = url;
    });
    container.appendChild(img);
  });
}

export async function onLoginSuccess(userProfile) {
  setActiveUser(userProfile.username, userProfile);
  localStorage.setItem(APP_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(userProfile));
  hideAuthOverlay();

  // Connect WebSocket gateway
  connectWebSocket(userProfile.username);

  // Update header profile display
  const avatarEl = $('chatsUserAvatar');
  const subtitleEl = $('chatsUserSubtitle');
  if (avatarEl) avatarEl.src = userProfile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${userProfile.username}`;
  if (subtitleEl) subtitleEl.textContent = `@${userProfile.username}`;

  // Check PIN Lock requirement
  const hasPin = isPinConfiguredForUser(userProfile.username);
  const pinEnabled = isPinLockEnabledForUser(userProfile.username);
  const setupShown = isPinSetupEverShownForUser(userProfile.username);

  if (hasPin && pinEnabled) {
    showPinOverlay();
  } else if (!hasPin && !setupShown) {
    openPasskeySetupModal();
  }
}

export function initAuthEvents(onAuthReadyCallback) {
  const tabLogin = $('authTabLogin');
  const tabRegister = $('authTabRegister');
  const formLogin = $('loginForm');
  const formRegister = $('registerForm');
  const loginFeedback = $('loginFeedback');
  const regFeedback = $('regFeedback');

  if (tabLogin) tabLogin.addEventListener('click', () => switchAuthTab('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => switchAuthTab('register'));

  initAvatarPresets();

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = ($('loginUsername')?.value || '').trim();
      const p = ($('loginPassword')?.value || '').trim();
      if (!u || !p) {
        if (loginFeedback) loginFeedback.textContent = 'Please enter both username and password';
        return;
      }
      if (loginFeedback) loginFeedback.textContent = 'Logging in...';

      try {
        const resp = await postLogin(u, p);
        if (resp && resp.user) {
          if (loginFeedback) loginFeedback.textContent = '';
          await onLoginSuccess(resp.user);
          if (onAuthReadyCallback) onAuthReadyCallback();
        }
      } catch (err) {
        if (loginFeedback) loginFeedback.textContent = err.message || 'Login failed';
      }
    });
  }

  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = ($('regUsername')?.value || '').trim();
      const d = ($('regDisplayName')?.value || '').trim();
      const p = ($('regPassword')?.value || '').trim();

      if (!u || !p) {
        if (regFeedback) regFeedback.textContent = 'Please fill out required fields';
        return;
      }
      if (regFeedback) regFeedback.textContent = 'Creating account...';

      try {
        const resp = await postRegister(u, p, d || u, selectedRegisterAvatar);
        if (resp && resp.user) {
          if (regFeedback) regFeedback.textContent = '';
          showToast('Account created successfully!', 'info');
          await onLoginSuccess(resp.user);
          if (onAuthReadyCallback) onAuthReadyCallback();
        }
      } catch (err) {
        if (regFeedback) regFeedback.textContent = err.message || 'Registration failed';
      }
    });
  }
}
