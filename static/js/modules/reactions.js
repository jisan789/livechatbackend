// LiveChat — Reactions & Flying Emoji Balloons Module
// Interactive floating emoji particles and emoji popovers

import { state } from '../state.js';
import { APP_CONFIG } from '../config.js';
import { $, showToast } from '../utils/dom.js';
import { wsSend } from '../services/websocket.js';

let lastSentEmojiTime = 0;

export function createFlyingBalloon(emoji) {
  const container = document.body;
  const balloon = document.createElement('div');
  balloon.className = 'flying-balloon-emoji';
  balloon.textContent = emoji;

  const left = 20 + Math.random() * 60;
  balloon.style.left = `${left}%`;
  balloon.style.bottom = '100px';

  container.appendChild(balloon);

  setTimeout(() => {
    balloon.remove();
  }, 3200);
}

export function sendFlyingEmoji(emoji) {
  const now = Date.now();
  if (now - lastSentEmojiTime < APP_CONFIG.FLYING_EMOJI_COOLDOWN_MS) {
    showToast('Please wait a moment before sending another emoji', 'info');
    return;
  }
  lastSentEmojiTime = now;

  createFlyingBalloon(emoji);
  wsSend({
    type: 'flying_emoji',
    emoji: emoji
  });
}

export function initReactionsEvents() {
  const loveBlastBtn = $('loveBlastBtn');
  const emojiPopover = $('emojiPopover');
  const emojiBtn = $('emojiBtn');

  if (loveBlastBtn) {
    loveBlastBtn.addEventListener('click', () => {
      sendFlyingEmoji('❤️');
    });
  }

  if (emojiBtn && emojiPopover) {
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = emojiPopover.style.display === 'flex';
      emojiPopover.style.display = isVisible ? 'none' : 'flex';
    });

    emojiPopover.querySelectorAll('.emoji-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const emoji = item.textContent.trim();
        const chatInput = $('chatInput');
        if (chatInput) {
          chatInput.value += emoji;
          chatInput.focus({ preventScroll: true });
        }
        emojiPopover.style.display = 'none';
      });
    });

    document.addEventListener('click', (e) => {
      if (!emojiPopover.contains(e.target) && e.target !== emojiBtn) {
        emojiPopover.style.display = 'none';
      }
    });
  }
}
