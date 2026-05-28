import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Middleware — Edge Runtime.
 *
 * ⚠️  Edge Runtime n'a pas accès aux variables d'env injectées au runtime
 *     via docker-compose (non disponibles à build-time).
 *     On se contente donc de vérifier l'EXISTENCE du cookie de session.
 *     La VALIDATION HMAC réelle est faite dans :
 *       - app/(main)/layout.tsx  → pour les pages (Node.js server component)
 *       - lib/auth.ts checkAuth  → pour les routes API (Node.js)
 */

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/webhooks/resend',
  '/_next',
  '/logo-cognix.png',
  '/favicon.ico',
  '/robots.txt',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Paths publics — toujours accessibles
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  // Statut moteur public (Header le poll avant auth)
  if (pathname === '/api/control/status') return NextResponse.next();

  // Machine-to-machine : x-api-key (valeur connue à build-time ou injectée)
  const apiKey = process.env.API_KEY;
  if (apiKey && req.headers.get('x-api-key') === apiKey) {
    return NextResponse.next();
  }

  // Browser : cookie existe ? (validation HMAC déléguée à Node.js)
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();

  // Non authentifié
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
