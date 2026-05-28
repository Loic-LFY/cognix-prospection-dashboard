/**
 * Gestion des sessions — Web Crypto API uniquement.
 * Compatible Edge Runtime (Next.js middleware) ET Node.js 18+.
 * Aucune dépendance sur le module 'crypto' de Node.js.
 */

export const SESSION_COOKIE = 'cognix_session';
export const SESSION_MAX_AGE = 7 * 24 * 3600; // 7 jours en secondes

const encoder = new TextEncoder();

function getSecret(): string {
  return process.env.DASHBOARD_PASSWORD ?? 'dev-insecure-change-me';
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(): Promise<string> {
  const payload = `${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const key = await getKey(getSecret());
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${bytesToHex(sig)}`;
}

export async function validateSessionToken(token: string): Promise<boolean> {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = token.slice(0, lastDot);
  const sigHex = token.slice(lastDot + 1);
  try {
    const key = await getKey(getSecret());
    const sigBytes = hexToBytes(sigHex);
    return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
  } catch {
    return false;
  }
}
