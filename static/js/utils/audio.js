// LiveChat — Audio & Keypress Sound Manager
// Handles Web Audio context, realistic mechanical switch click synthesis, and playback

import { state } from '../state.js';
import { APP_CONFIG } from '../config.js';
import { $ } from './dom.js';

let audioCtx = null;
let keypressBuffers = [];
let audioBuffersLoaded = false;

export function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export async function loadKeypressSounds() {
  if (audioBuffersLoaded) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const files = [
    'static/keypresssound/1.mp3',
    'static/keypresssound/2.mp3',
    'static/keypresssound/3.mp3',
    'static/keypresssound/4.mp3'
  ];

  try {
    const promises = files.map(url =>
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error('Sound not found');
          return res.arrayBuffer();
        })
        .then(buf => ctx.decodeAudioData(buf))
        .catch(() => null)
    );
    const results = await Promise.all(promises);
    keypressBuffers = results.filter(b => b !== null);
    if (keypressBuffers.length > 0) {
      audioBuffersLoaded = true;
    }
  } catch (_) {}
}

export function playKeypressSynthesizedFallback(ctx) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450 + Math.random() * 80, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.035);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  } catch (_) {}
}

export function playOpponentKeypressSound() {
  if (state.isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (keypressBuffers.length > 0) {
    try {
      const idx = Math.floor(Math.random() * keypressBuffers.length);
      const buffer = keypressBuffers[idx];
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.5;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
      return;
    } catch (_) {}
  }

  playKeypressSynthesizedFallback(ctx);
}

export function initSoundMuteState() {
  const saved = localStorage.getItem(APP_CONFIG.SOUND_MUTED_KEY);
  state.isMuted = (saved === 'true');
  updateSoundBtnUI();
}

export function toggleSoundMute() {
  state.isMuted = !state.isMuted;
  localStorage.setItem(APP_CONFIG.SOUND_MUTED_KEY, state.isMuted ? 'true' : 'false');
  updateSoundBtnUI();
  getAudioContext();
}

export function updateSoundBtnUI() {
  const btn = $('soundToggleBtn');
  if (btn) {
    btn.classList.toggle('muted', state.isMuted);
    btn.title = state.isMuted ? 'Unmute keypress sounds' : 'Mute keypress sounds';
  }
}
