// LiveChat — API Service Layer
// Communicates with the FastAPI backend and external storage

import { state } from '../state.js';

export async function fetchUsers() {
  const url = state.activeUser
    ? `/api/users?current_user=${encodeURIComponent(state.activeUser)}`
    : '/api/users';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data && Array.isArray(data.users)) ? data.users : [];
}

export async function fetchPresence(userKey) {
  if (!userKey) return null;
  const res = await fetch(`/api/presence/${encodeURIComponent(userKey)}`);
  if (!res.ok) return null;
  return await res.json();
}

export async function fetchConversation(opponent) {
  if (!opponent) return [];
  const url = state.activeUser
    ? `/api/messages/${encodeURIComponent(opponent)}?user=${encodeURIComponent(state.activeUser)}`
    : `/api/messages/${encodeURIComponent(opponent)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data && Array.isArray(data.messages)) ? data.messages : [];
}

export async function postMarkSeen(opponent, ids = null, all = false) {
  if (!opponent || !state.activeUser) return;
  try {
    await fetch('/api/messages/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: state.activeUser,
        opponent: opponent,
        ids: ids,
        all: all
      })
    });
  } catch (_) {}
}

export async function updateProfile(displayName, avatar) {
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      display_name: displayName,
      avatar: avatar
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function postLogin(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok || data.status !== 'ok') {
    throw new Error(data.message || 'Login failed');
  }
  return data;
}

export async function postRegister(username, password, displayName, avatar) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      display_name: displayName,
      avatar
    })
  });
  const data = await res.json();
  if (!res.ok || data.status !== 'ok') {
    throw new Error(data.message || 'Registration failed');
  }
  return data;
}

export async function postLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (_) {}
}
