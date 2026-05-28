import { createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'cognix_session';
export const SESSION_MAX_AGE = 7 * 24 * 3600; // 7j en secondes

function getSecret(): string {
  return process.env.DASHBOARD_PASSWORD ?? 'dev-insecure-change-me';
}

export function createSessionToken(): string {
  const payload = `${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function validateSessionToken(token: string): boolean {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = createHmac('sha256', getSecret()).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
