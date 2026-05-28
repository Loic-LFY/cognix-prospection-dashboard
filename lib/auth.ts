import { NextRequest, NextResponse } from 'next/server';
import { validateSessionToken, SESSION_COOKIE } from '@/lib/session';

/** Auth machine-to-machine (x-api-key) OU browser (session cookie). */
export function checkAuth(req: NextRequest): NextResponse | null {
  const apiKey = process.env.API_KEY;
  // x-api-key valide
  if (apiKey && req.headers.get('x-api-key') === apiKey) return null;
  // Pas d'API_KEY configurée → dev mode
  if (!apiKey) return null;
  // Session cookie valide
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && validateSessionToken(token)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Alias rétrocompat — utiliser checkAuth de préférence. */
export const checkApiKey = checkAuth;
