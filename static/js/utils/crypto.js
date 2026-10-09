// LiveChat — Cryptographic Utilities
// Handles SHA-256 PIN hashing and passkey security

export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode('livechat_salt_' + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
