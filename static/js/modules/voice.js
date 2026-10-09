// LiveChat — Voice Messaging & Audio Player Module
// High-fidelity voice notes, live mic visualizer, audio format cleanup, and seeking

import { state } from '../state.js';
import { DEFAULT_SPEECH_WAVEFORM } from '../config.js';
import { $, showToast, formatDuration, formatCurrentTime } from '../utils/dom.js';
import { getAudioContext, playOpponentKeypressSound } from '../utils/audio.js';
import { wsSend } from '../services/websocket.js';
import { updateChatsListCardUI } from './chats-list.js';

let mediaRecorder = null;
let audioChunks = [];
let recordStream = null;
let recordingInterval = null;
let recordingSeconds = 0;
let isRecording = false;
let isRecordCancelled = false;

// Audio Analyser for live mic reactive waveform
let micAnalyser = null;
let micSource = null;
let micAnimFrame = null;
let recordedWaveformSamples = [];

export function formatAudioSrc(src) {
  if (!src || typeof src !== 'string') return '';
  src = src.trim();
  // Strip codec attributes like ;codecs=opus that prevent playback on some browsers
  if (src.startsWith('data:audio/') && src.includes(';codecs=')) {
    src = src.replace(/;codecs=[^;,\s]+/, '');
  }
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/') || src.startsWith('blob:')) {
    return src;
  }
  return `data:audio/webm;base64,${src}`;
}

export function startLiveMicVisualizer(stream) {
  recordedWaveformSamples = [];
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    micSource = ctx.createMediaStreamSource(stream);
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 64;
    micSource.connect(micAnalyser);

    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    const bars = document.querySelectorAll('#inputRecordingContent .rec-bar');

    function draw() {
      if (!isRecording) return;
      micAnimFrame = requestAnimationFrame(draw);
      micAnalyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const avg = sum / dataArray.length;
      recordedWaveformSamples.push(avg);

      bars.forEach((bar, idx) => {
        const val = dataArray[idx % dataArray.length] || 0;
        const h = Math.max(4, Math.min(24, Math.round((val / 255) * 24)));
        bar.style.height = `${h}px`;
      });
    }
    draw();
  } catch (_) {}
}

export function stopLiveMicVisualizer() {
  if (micAnimFrame) cancelAnimationFrame(micAnimFrame);
  if (micSource) {
    try { micSource.disconnect(); } catch (_) {}
    micSource = null;
  }
  micAnalyser = null;
}

export function getRecordedWaveformContour() {
  if (recordedWaveformSamples.length < 16) return DEFAULT_SPEECH_WAVEFORM;
  const targetCount = 32;
  const step = Math.floor(recordedWaveformSamples.length / targetCount);
  const result = [];
  for (let i = 0; i < targetCount; i++) {
    const sample = recordedWaveformSamples[i * step] || 0;
    const h = Math.max(5, Math.min(26, Math.round((sample / 255) * 26)));
    result.push(h);
  }
  return result;
}

export function getSupportedAudioMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export async function startVoiceRecording() {
  if (isRecording) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Microphone access not supported', 'error');
    return;
  }

  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    showToast('Microphone permission denied', 'error');
    return;
  }

  const mimeType = getSupportedAudioMimeType();
  const options = mimeType ? { mimeType } : {};

  try {
    mediaRecorder = new MediaRecorder(recordStream, options);
  } catch (err) {
    try {
      mediaRecorder = new MediaRecorder(recordStream);
    } catch (e) {
      showToast('Could not initialize audio recorder', 'error');
      if (recordStream) recordStream.getTracks().forEach(t => t.stop());
      recordStream = null;
      return;
    }
  }

  audioChunks = [];
  isRecording = true;
  isRecordCancelled = false;
  recordingSeconds = 0;

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    stopLiveMicVisualizer();
    if (recordStream) {
      recordStream.getTracks().forEach(t => t.stop());
      recordStream = null;
    }
    if (isRecordCancelled || audioChunks.length === 0) {
      audioChunks = [];
      return;
    }

    const recordedMime = (mediaRecorder && mediaRecorder.mimeType) || mimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunks, { type: recordedMime });
    audioChunks = [];

    const finalDuration = Math.max(1, recordingSeconds);
    const waveformContour = getRecordedWaveformContour();

    const reader = new FileReader();
    reader.onloadend = () => {
      let base64Audio = reader.result;
      if (typeof base64Audio === 'string') {
        base64Audio = formatAudioSrc(base64Audio);
      }
      const clientTime = formatCurrentTime();
      const voiceMsgId = 'voice_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const replyPayload = state.activeReplyContext ? { ...state.activeReplyContext } : null;
      state.activeReplyContext = null;

      appendVoiceMessage(base64Audio, finalDuration, 'outgoing', clientTime, voiceMsgId, waveformContour, false, false, replyPayload);

      const payload = {
        type: 'voice',
        audio: base64Audio,
        duration: finalDuration,
        waveform: waveformContour,
        time: clientTime,
        id: voiceMsgId
      };
      if (replyPayload) payload.reply_to = replyPayload;
      wsSend(payload, true);
    };
    reader.readAsDataURL(audioBlob);
  };

  mediaRecorder.start(200);
  startLiveMicVisualizer(recordStream);

  const recordingTimer = $('recordingTimer');
  const inputNormal = $('inputNormalContent');
  const inputRecording = $('inputRecordingContent');
  if (recordingTimer) recordingTimer.textContent = '0:00';
  if (inputNormal) {
    inputNormal.style.opacity = '0';
    inputNormal.style.pointerEvents = 'none';
  }
  if (inputRecording) inputRecording.style.display = 'flex';

  clearInterval(recordingInterval);
  recordingInterval = setInterval(() => {
    recordingSeconds++;
    if (recordingTimer) recordingTimer.textContent = formatDuration(recordingSeconds);
  }, 1000);
}

export function stopVoiceRecording() {
  if (!isRecording) return;
  clearInterval(recordingInterval);
  isRecording = false;
  isRecordCancelled = false;
  stopLiveMicVisualizer();
  resetRecordingUI();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

export function cancelVoiceRecording() {
  if (!isRecording) return;
  clearInterval(recordingInterval);
  isRecording = false;
  isRecordCancelled = true;
  stopLiveMicVisualizer();
  resetRecordingUI();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else if (recordStream) {
    recordStream.getTracks().forEach(t => t.stop());
    recordStream = null;
  }
  showToast('Recording cancelled', 'info');
}

export function resetRecordingUI() {
  const inputRecording = $('inputRecordingContent');
  const inputNormal = $('inputNormalContent');
  if (inputRecording) inputRecording.style.display = 'none';
  if (inputNormal) {
    inputNormal.style.opacity = '1';
    inputNormal.style.pointerEvents = 'auto';
  }
}

export function appendVoiceMessage(audioData, seconds, type = 'outgoing', timeStr = null, messageId = null, customWaveform = null, isSeenOrStatus = false, skipScroll = false, replyTo = null) {
  const chatMessages = $('chatMessages');
  const typingIndicator = $('typingIndicator');
  if (!chatMessages) return;

  if (messageId && chatMessages.querySelector(`.message-row[data-msg-id="${messageId}"]`)) {
    return;
  }

  const assignedId = messageId || ('voice_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  const durationSec = Math.max(1, Math.round(Number(seconds) || 1));
  const durationText = formatDuration(durationSec);
  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${type}`;
  messageRow.dataset.msgId = assignedId;

  const isSeen = (isSeenOrStatus === true || isSeenOrStatus === 'seen');
  const statusStr = typeof isSeenOrStatus === 'string' ? isSeenOrStatus : (isSeen ? 'seen' : 'sent');

  state.lastConversationMessage = {
    text: 'Voice note',
    msg_type: 'voice',
    media_duration: durationSec,
    time: timeStr || formatCurrentTime(),
    isOutgoing: type === 'outgoing',
    isSeen: isSeen
  };
  updateChatsListCardUI();

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  // Build 32 waveform bars
  let barHeights = DEFAULT_SPEECH_WAVEFORM;
  if (Array.isArray(customWaveform) && customWaveform.length >= 8) {
    barHeights = customWaveform;
  }
  const barsHtml = barHeights.map(h => `<span class="waveform-bar" style="height:${Math.max(4, Math.min(26, h))}px;"></span>`).join('');

  bubble.innerHTML = `
    <div class="voice-bubble">
      <button class="voice-play-btn" type="button" aria-label="Play Voice Note" title="Play">
        <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 4 19 12 6 20 6 4"></polygon>
        </svg>
        <svg class="pause-icon" style="display:none;" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      </button>
      <div class="voice-waveform" title="Click to seek">${barsHtml}</div>
      <span class="voice-duration">${durationText}</span>
    </div>
  `;

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

  // Voice playback setup
  const voiceBubble = bubble.querySelector('.voice-bubble');
  const playBtn = bubble.querySelector('.voice-play-btn');
  const playIcon = bubble.querySelector('.play-icon');
  const pauseIcon = bubble.querySelector('.pause-icon');
  const durationEl = bubble.querySelector('.voice-duration');
  const waveformContainer = bubble.querySelector('.voice-waveform');
  const waveformBars = bubble.querySelectorAll('.waveform-bar');

  const cleanAudioSrc = formatAudioSrc(audioData);
  let audio = null;

  function initAudio() {
    if (!audio && cleanAudioSrc) {
      try {
        audio = new Audio(cleanAudioSrc);
        audio.preload = 'metadata';
        setupAudioListeners();
      } catch (e) {
        console.warn('[Voice] Audio init failed:', e);
      }
    }
  }

  function resetAudioUI() {
    voiceBubble.classList.remove('playing');
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    durationEl.textContent = durationText;
    waveformBars.forEach(b => b.classList.remove('played'));
    if (state.currentlyPlayingVoiceAudio === audio) {
      state.currentlyPlayingVoiceAudio = null;
      state.currentlyPlayingVoiceReset = null;
    }
  }

  function setupAudioListeners() {
    if (!audio) return;
    audio.addEventListener('timeupdate', () => {
      const dur = audio.duration && !isNaN(audio.duration) ? audio.duration : durationSec;
      const progress = Math.min(1, Math.max(0, audio.currentTime / dur));
      const activeBarCount = Math.floor(progress * waveformBars.length);
      waveformBars.forEach((bar, idx) => {
        bar.classList.toggle('played', idx <= activeBarCount);
      });
      durationEl.textContent = formatDuration(Math.floor(audio.currentTime));
    });

    audio.addEventListener('ended', resetAudioUI);
    audio.addEventListener('pause', () => {
      if (!audio.ended) {
        voiceBubble.classList.remove('playing');
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    });
    audio.addEventListener('error', () => {
      resetAudioUI();
      showToast('Could not play voice note', 'error');
    });
  }

  if (cleanAudioSrc) initAudio();

  // Waveform click to seek
  waveformContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audio) initAudio();
    if (!audio) return;
    const rect = waveformContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const dur = audio.duration && !isNaN(audio.duration) ? audio.duration : durationSec;
    audio.currentTime = progress * dur;
    durationEl.textContent = formatDuration(Math.floor(audio.currentTime));

    const activeBarCount = Math.floor(progress * waveformBars.length);
    waveformBars.forEach((bar, idx) => {
      bar.classList.toggle('played', idx <= activeBarCount);
    });

    if (audio.paused) playBtn.click();
  });

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audio) initAudio();
    if (!audio) {
      showToast('No audio stream available', 'error');
      return;
    }

    if (audio.paused) {
      if (state.currentlyPlayingVoiceAudio && state.currentlyPlayingVoiceAudio !== audio) {
        try { state.currentlyPlayingVoiceAudio.pause(); } catch (_) {}
        if (state.currentlyPlayingVoiceReset) state.currentlyPlayingVoiceReset();
      }

      state.currentlyPlayingVoiceAudio = audio;
      state.currentlyPlayingVoiceReset = resetAudioUI;

      audio.play().then(() => {
        voiceBubble.classList.add('playing');
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
      }).catch(err => {
        console.warn('[Voice] Play error:', err);
        resetAudioUI();
        showToast('Playback permission or format error', 'error');
      });
    } else {
      audio.pause();
      voiceBubble.classList.remove('playing');
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  });

  // Tapping anywhere on voiceBubble toggles play/pause
  voiceBubble.addEventListener('click', (e) => {
    if (e.target.closest('.voice-waveform') || e.target.closest('.voice-play-btn')) return;
    playBtn.click();
  });
}

export function receiveIncomingVoice(audioData, duration, timeStr, messageId = null, waveform = null, replyTo = null) {
  const cleanAudio = formatAudioSrc(audioData);
  const finalDuration = Math.max(1, Math.round(Number(duration) || 1));

  state.lastConversationMessage = {
    text: 'Voice note',
    msg_type: 'voice',
    media_duration: finalDuration,
    time: timeStr || formatCurrentTime(),
    isOutgoing: false,
    isSeen: state.currentView === 'conversation'
  };
  updateChatsListCardUI();

  playOpponentKeypressSound();
  appendVoiceMessage(cleanAudio, finalDuration, 'incoming', timeStr, messageId, waveform, false, false, replyTo);
}
