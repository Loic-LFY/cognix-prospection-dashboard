import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cognix Prospection Dashboard',
  description: 'Suivi des leads et prospection LinkedIn — Cognix Systems',
  robots: { index: false, follow: false },
  icons: { icon: '/logo-cognix.png', apple: '/logo-cognix.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.className} bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
