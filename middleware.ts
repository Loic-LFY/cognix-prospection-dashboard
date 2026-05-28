import { NextRequest, NextResponse } from 'next/server';
import { validateSessionToken, SESSION_COOKIE } from '@/lib/session';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/webhooks/resend',
  '/_next',
  '/logo-cognix.png',
  '/favicon.ico',
  '/robots.txt',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Paths publics
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  // Statut moteur public (Header le fetch avant auth)
  if (pathname === '/api/control/status') return NextResponse.next();

  // Machine-to-machine : x-api-key
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const provided = req.headers.get('x-api-key');
    if (provided === apiKey) return NextResponse.next();
  }

  // Browser : session cookie
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await validateSessionToken(token))) return NextResponse.next();

  // Non authentifié
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
