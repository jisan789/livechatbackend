// LiveChat — PIN Lock & Security Passcode Module
// Manages keypad input, authentication gating, and Passkey setup

import { state } from '../state.js';
import { APP_CONFIG } from '../config.js';
import { hashPin } from '../utils/crypto.js';
import { $, showToast } from '../utils/dom.js';

export function isPinConfiguredForUser(username) {
  if (!username) return false;
  return localStorage.getItem(APP_CONFIG.PIN_STORAGE_KEY_PREFIX + username.toLowerCase()) !== null;
}

export function isPinSetupEverShownForUser(username) {
  if (!username) return false;
  return localStorage.getItem(APP_CONFIG.PIN_SETUP_SHOWN_PREFIX + username.toLowerCase()) !== null;
}

export function markPinSetupShownForUser(username) {
  if (!username) return;
  localStorage.setItem(APP_CONFIG.PIN_SETUP_SHOWN_PREFIX + username.toLowerCase(), 'true');
}

export function isPinLockEnabledForUser(username) {
  if (!username) return false;
  const val = localStorage.getItem(APP_CONFIG.PIN_ENABLED_PREFIX + username.toLowerCase());
  return val === null ? true : val === 'true';
}

export function showPinOverlay() {
  const overlay = $('pinOverlay');
  if (!overlay) return;
  state.isAppLocked = true;
  state.pinEntered = '';
  sessionStorage.setItem(APP_CONFIG.PIN_APP_LOCKED_KEY, 'true');

  const avatar = $('pinUserAvatar');
  const title = $('pinTitleText');
  const subtitle = $('pinSubtitleText');
  const user = state.currentUserProfile || { username: state.activeUser, display_name: state.activeUser };

  if (avatar) avatar.src = user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + (state.activeUser || 'user');
  if (title) title.textContent = user.display_name || state.activeUser || 'Welcome Back';
  if (subtitle) subtitle.textContent = `Enter passcode for @${state.activeUser || 'user'}`;

  updatePinDotsUI();
  overlay.style.display = 'flex';
}

export function hidePinOverlay() {
  const overlay = $('pinOverlay');
  if (!overlay) return;
  state.isAppLocked = false;
  state.pinEntered = '';
  sessionStorage.removeItem(APP_CONFIG.PIN_APP_LOCKED_KEY);
  overlay.style.display = 'none';
}

export function updatePinDotsUI() {
  const container = $('pinDots');
  if (!container) return;
  const dots = container.querySelectorAll('.pin-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('filled', idx < state.pinEntered.length);
  });
}

export async function handlePinDigit(digit) {
  if (!state.isAppLocked || state.pinEntered.length >= APP_CONFIG.MAX_PIN_LENGTH) return;
  state.pinEntered += digit;
  updatePinDotsUI();

  if (state.pinEntered.length === APP_CONFIG.MAX_PIN_LENGTH) {
    const hashed = await hashPin(state.pinEntered);
    const expected = localStorage.getItem(APP_CONFIG.PIN_STORAGE_KEY_PREFIX + state.activeUser);

    if (hashed === expected) {
      const container = $('pinDots');
      if (container) container.classList.add('success');
      setTimeout(() => {
        if (container) container.classList.remove('success');
        hidePinOverlay();
      }, 250);
    } else {
      const container = $('pinDots');
      const feedback = $('pinFeedback');
      if (container) container.classList.add('shake');
      if (feedback) feedback.textContent = 'Incorrect passcode';

      setTimeout(() => {
        if (container) container.classList.remove('shake');
        if (feedback) feedback.textContent = '';
        state.pinEntered = '';
        updatePinDotsUI();
      }, 600);
    }
  }
}

export function handlePinBackspace() {
  if (!state.isAppLocked || state.pinEntered.length === 0) return;
  state.pinEntered = state.pinEntered.slice(0, -1);
  updatePinDotsUI();
}

// Passkey Setup Modal Flow
export function openPasskeySetupModal() {
  const modal = $('passkeySetupModal');
  if (!modal) return;
  state.passkeySetupEntered = '';
  state.passkeySetupFirst = null;
  updatePasskeySetupDotsUI();

  const title = $('passkeySetupTitle');
  const subtitle = $('passkeySetupSubtitle');
  if (title) title.textContent = 'Create Passcode';
  if (subtitle) subtitle.textContent = 'Enter a 4-digit security code';

  modal.style.display = 'flex';
}

export function closePasskeySetupModal() {
  const modal = $('passkeySetupModal');
  if (!modal) return;
  modal.style.display = 'none';
  if (state.activeUser) {
    markPinSetupShownForUser(state.activeUser);
  }
}

export function updatePasskeySetupDotsUI() {
  const container = $('passkeySetupDots');
  if (!container) return;
  const dots = container.querySelectorAll('.passkey-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('filled', idx < state.passkeySetupEntered.length);
  });
}

export async function handlePasskeySetupDigit(digit) {
  if (state.passkeySetupEntered.length >= APP_CONFIG.MAX_PIN_LENGTH) return;
  state.passkeySetupEntered += digit;
  updatePasskeySetupDotsUI();

  if (state.passkeySetupEntered.length === APP_CONFIG.MAX_PIN_LENGTH) {
    if (state.passkeySetupFirst === null) {
      // First pass completed
      state.passkeySetupFirst = state.passkeySetupEntered;
      state.passkeySetupEntered = '';
      const title = $('passkeySetupTitle');
      const subtitle = $('passkeySetupSubtitle');
      if (title) title.textContent = 'Confirm Passcode';
      if (subtitle) subtitle.textContent = 'Re-enter your 4-digit code to verify';
      updatePasskeySetupDotsUI();
    } else {
      // Confirm pass
      if (state.passkeySetupEntered === state.passkeySetupFirst) {
        const hashed = await hashPin(state.passkeySetupEntered);
        localStorage.setItem(APP_CONFIG.PIN_STORAGE_KEY_PREFIX + state.activeUser, hashed);
        localStorage.setItem(APP_CONFIG.PIN_ENABLED_PREFIX + state.activeUser, 'true');
        markPinSetupShownForUser(state.activeUser);
        showToast('Passcode created successfully', 'info');
        closePasskeySetupModal();
      } else {
        const feedback = $('passkeySetupFeedback');
        const container = $('passkeySetupDots');
        if (container) container.classList.add('shake');
        if (feedback) feedback.textContent = 'Codes did not match. Try again';

        setTimeout(() => {
          if (container) container.classList.remove('shake');
          if (feedback) feedback.textContent = '';
          state.passkeySetupFirst = null;
          state.passkeySetupEntered = '';
          const title = $('passkeySetupTitle');
          const subtitle = $('passkeySetupSubtitle');
          if (title) title.textContent = 'Create Passcode';
          if (subtitle) subtitle.textContent = 'Enter a 4-digit security code';
          updatePasskeySetupDotsUI();
        }, 800);
      }
    }
  }
}

export function handlePasskeySetupBackspace() {
  if (state.passkeySetupEntered.length === 0) return;
  state.passkeySetupEntered = state.passkeySetupEntered.slice(0, -1);
  updatePasskeySetupDotsUI();
}

export function initPinKeypadEvents() {
  const pinOverlay = $('pinOverlay');
  if (pinOverlay) {
    pinOverlay.querySelectorAll('.pin-key-btn[data-digit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handlePinDigit(btn.dataset.digit);
      });
    });

    const bsBtn = $('pinBackspaceBtn');
    if (bsBtn) {
      bsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handlePinBackspace();
      });
    }

    const switchBtn = $('pinSwitchAccountBtn');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        hidePinOverlay();
        const authOverlay = $('authOverlay');
        if (authOverlay) authOverlay.style.display = 'flex';
      });
    }
  }

  const passkeyModal = $('passkeySetupModal');
  if (passkeyModal) {
    passkeyModal.querySelectorAll('.passkey-key-btn[data-digit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handlePasskeySetupDigit(btn.dataset.digit);
      });
    });

    const bsBtn = $('passkeySetupBackspaceBtn');
    if (bsBtn) {
      bsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handlePasskeySetupBackspace();
      });
    }

    const skipBtn = $('passkeySetupSkipBtn');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        closePasskeySetupModal();
      });
    }
  }
}
