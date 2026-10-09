// LiveChat — Media & Lightbox Module
// Handles client-side canvas compression, uploads, and fullscreen lightbox

import { state } from '../state.js';
import { $, showToast, formatCurrentTime } from '../utils/dom.js';
import { wsSend } from '../services/websocket.js';
import { appendImageMessage } from './conversation.js';

export function openImageLightbox(src) {
  const lightbox = $('imageLightbox');
  const img = $('lightboxImage');
  if (!lightbox || !img || !src) return;

  img.src = src;
  lightbox.style.display = 'flex';
  lightbox.setAttribute('aria-hidden', 'false');
}

export function closeImageLightbox() {
  const lightbox = $('imageLightbox');
  const img = $('lightboxImage');
  if (!lightbox) return;

  lightbox.style.display = 'none';
  lightbox.setAttribute('aria-hidden', 'true');
  if (img) img.src = '';
}

export function compressImage(file, maxDimension = 1280, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function handleImageUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file', 'error');
    return;
  }

  showToast('Compressing image...', 'info');
  try {
    const base64Data = await compressImage(file);
    const clientTime = formatCurrentTime();
    const msgId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const replyPayload = state.activeReplyContext ? { ...state.activeReplyContext } : null;
    state.activeReplyContext = null;

    appendImageMessage(base64Data, 'outgoing', clientTime, msgId, false, false, replyPayload);

    const payload = {
      type: 'image',
      image: base64Data,
      time: clientTime,
      id: msgId
    };
    if (replyPayload) payload.reply_to = replyPayload;
    wsSend(payload, true);
  } catch (err) {
    showToast('Failed to process image', 'error');
  }
}

export function initMediaEvents() {
  const imageBtn = $('imageBtn');
  const fileInput = $('imageFileInput');
  const closeBtn = $('lightboxCloseBtn');
  const backdrop = $('lightboxBackdrop');

  if (imageBtn && fileInput) {
    imageBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleImageUpload(file);
      fileInput.value = '';
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeImageLightbox);
  if (backdrop) backdrop.addEventListener('click', closeImageLightbox);
}
