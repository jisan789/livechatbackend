// LiveChat — Application Constants & Configuration
// Shared across all modular components

export const APP_CONFIG = {
  APP_VERSION: '23.0',
  WS_RECONNECT_INITIAL_DELAY: 1000,
  WS_RECONNECT_MAX_DELAY: 30000,
  WS_PING_INTERVAL_MS: 25000,
  LIVE_TYPING_DEBOUNCE_MS: 300,
  TYPING_STOP_TIMEOUT_MS: 1500,
  FLYING_EMOJI_COOLDOWN_MS: 2000,
  SESSION_STORAGE_KEY: 'chat_user',
  PIN_STORAGE_KEY_PREFIX: 'chat_pin_hash_',
  PIN_SETUP_SHOWN_PREFIX: 'chat_pin_setup_shown_',
  PIN_ENABLED_PREFIX: 'chat_pin_enabled_',
  PIN_APP_LOCKED_KEY: 'chat_app_locked',
  SOUND_MUTED_KEY: 'chat_sound_muted',
  MAX_PIN_LENGTH: 4
};

export const MIC_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;

export const SEND_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;

export const DEFAULT_SPEECH_WAVEFORM = [
  6, 10, 16, 22, 14, 8, 12, 20, 26, 18, 12, 16, 24, 28, 20, 14, 18, 22, 26, 16, 10, 14, 22, 18, 12, 16, 20, 14, 8, 12, 16, 10
];

export const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Milo',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Luna',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Leo',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Zoe'
];
