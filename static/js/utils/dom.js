// LiveChat — DOM Utilities & Helpers
// Provides safe element queries, formatting, and toast feedback

export const $ = (id) => document.getElementById(id);
export const $$ = (sel, parent = document) => parent.querySelectorAll(sel);

let toastTimer = null;

export function showToast(msg, type = 'info') {
  let toastEl = $('appToast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'appToast';
    toastEl.className = 'app-toast';
    document.body.appendChild(toastEl);
  }

  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className = `app-toast visible toast-${type}`;

  toastTimer = setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 2400);
}

export function formatCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatTimeFromIso(isoStr) {
  if (!isoStr) return formatCurrentTime();
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return formatCurrentTime();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (_) {
    return formatCurrentTime();
  }
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatLastSeen(isoStr) {
  if (!isoStr) return 'Offline';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Offline';
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch (_) {
    return 'Offline';
  }
}
