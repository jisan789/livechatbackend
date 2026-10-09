// LiveChat — WebSocket Service Layer
// Manages real-time bi-directional connection, ping/pong, and message dispatching

import { state } from '../state.js';
import { APP_CONFIG } from '../config.js';

const messageHandlers = new Set();

export function onWebSocketMessage(fn) {
  messageHandlers.add(fn);
  return () => messageHandlers.delete(fn);
}

export function getWsUrl(userKey) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws/${encodeURIComponent(userKey)}`;
}

export function connectWebSocket(userKey) {
  if (!userKey) return;
  state.isManualDisconnect = false;

  if (state.ws) {
    if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
      return;
    }
    state.ws.close();
    state.ws = null;
  }

  clearTimeout(state.wsReconnectTimer);

  try {
    state.ws = new WebSocket(getWsUrl(userKey));
  } catch (e) {
    console.warn('[WS] Connect failed:', e);
    scheduleReconnect(userKey);
    return;
  }

  state.ws.onopen = () => {
    state.wsReconnectDelay = APP_CONFIG.WS_RECONNECT_INITIAL_DELAY;

    // Flush queued payloads
    if (state.offlineQueue.length > 0) {
      const items = [...state.offlineQueue];
      state.offlineQueue = [];
      items.forEach(payload => wsSend(payload, true));
    }

    dispatchInternalEvent({ type: 'ws_connected', userKey });
  };

  state.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      messageHandlers.forEach(handler => {
        try { handler(msg); } catch (err) { console.error('[WS] Handler error:', err); }
      });
    } catch (e) {
      console.warn('[WS] JSON parse error:', e);
    }
  };

  state.ws.onclose = (e) => {
    state.ws = null;
    dispatchInternalEvent({ type: 'ws_disconnected', code: e.code });
    if (!state.isManualDisconnect && state.activeUser) {
      scheduleReconnect(state.activeUser);
    }
  };

  state.ws.onerror = (e) => {
    console.warn('[WS] Error event:', e);
  };
}

export function scheduleReconnect(userKey) {
  clearTimeout(state.wsReconnectTimer);
  state.wsReconnectTimer = setTimeout(() => {
    if (state.activeUser) {
      state.wsReconnectDelay = Math.min(state.wsReconnectDelay * 2, APP_CONFIG.WS_RECONNECT_MAX_DELAY);
      connectWebSocket(userKey);
    }
  }, state.wsReconnectDelay);
}

export function disconnectWebSocket() {
  state.isManualDisconnect = true;
  clearTimeout(state.wsReconnectTimer);
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
}

export function wsSend(payload, shouldQueue = false) {
  if (state.currentPartner && state.currentPartner.key) {
    if (!payload.to) payload.to = state.currentPartner.key;
    if (!payload.recipient) payload.recipient = state.currentPartner.key;
    if (!payload.partner) payload.partner = state.currentPartner.key;
  }

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    try {
      state.ws.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[WS] Send failed:', e);
    }
  }

  if (shouldQueue) {
    state.offlineQueue.push(payload);
  }
  return false;
}

function dispatchInternalEvent(evt) {
  messageHandlers.forEach(handler => {
    try { handler(evt); } catch (_) {}
  });
}
