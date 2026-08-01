const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createOAuthState(userId: string) {
  const secret = Deno.env.get('DRIVE_STATE_SECRET');
  if (!secret) throw new Error('Secret serveur manquant: DRIVE_STATE_SECRET');
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 600,
    nonce: crypto.randomUUID()
  })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(payload)));
  return `${payload}.${bytesToBase64Url(signature)}`;
}

export async function verifyOAuthState(state: string) {
  const secret = Deno.env.get('DRIVE_STATE_SECRET');
  if (!secret) throw new Error('Secret serveur manquant: DRIVE_STATE_SECRET');
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw new Error('État OAuth invalide');
  const valid = await crypto.subtle.verify(
    'HMAC', await hmacKey(secret), base64UrlToBytes(signature), encoder.encode(payload)
  );
  if (!valid) throw new Error('Signature OAuth invalide');
  const parsed = JSON.parse(decoder.decode(base64UrlToBytes(payload)));
  if (!parsed.sub || !Number.isInteger(parsed.exp) || parsed.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('État OAuth expiré');
  }
  return parsed as { sub: string; exp: number; nonce: string };
}

async function encryptionKey() {
  const raw = Deno.env.get('DRIVE_TOKEN_ENCRYPTION_KEY');
  if (!raw) throw new Error('Secret serveur manquant: DRIVE_TOKEN_ENCRYPTION_KEY');
  const bytes = base64UrlToBytes(raw);
  if (bytes.length !== 32) throw new Error('Clé de chiffrement Drive invalide');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, await encryptionKey(), encoder.encode(token)
  ));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`;
}

export async function decryptToken(value: string) {
  const [version, iv, encrypted] = String(value || '').split('.');
  if (version !== 'v1' || !iv || !encrypted) throw new Error('Jeton Drive chiffré invalide');
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(iv) },
    await encryptionKey(), base64UrlToBytes(encrypted)
  );
  return decoder.decode(clear);
}
