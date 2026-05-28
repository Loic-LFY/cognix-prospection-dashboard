import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSessionToken, SESSION_COOKIE } from '@/lib/session';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

/**
 * Layout principal — Node.js server component.
 * Valide le HMAC du cookie ici car process.env est accessible au runtime
 * (contrairement au middleware Edge qui ne voit que les env vars de build-time).
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token || !(await validateSessionToken(token))) {
    redirect('/login');
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-screen-xl w-full mx-auto px-4 py-6">{children}</main>
      <Footer />
    </>
  );
}
