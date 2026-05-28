import { NextRequest, NextResponse } from 'next/server';
import { validateSessionToken, SESSION_COOKIE } from '@/lib/session';

/**
 * Auth machine-to-machine (x-api-key) OU browser (session cookie).
 * Async car validateSessionToken utilise Web Crypto.
 */
export async function checkAuth(req: NextRequest): Promise<NextResponse | null> {
  const apiKey = process.env.API_KEY;
  // x-api-key valide
  if (apiKey && req.headers.get('x-api-key') === apiKey) return null;
  // Pas d'API_KEY → dev mode, tout passe
  if (!apiKey) return null;
  // Session cookie valide
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await validateSessionToken(token))) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Alias rétrocompat */
export const checkApiKey = checkAuth;
