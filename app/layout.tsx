import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cognix Prospection Dashboard',
  description: 'Suivi des leads et prospection LinkedIn — Cognix Systems',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.className} bg-gray-50 dark:bg-gray-900 min-h-screen`}>
        <Header />
        <main className="max-w-screen-xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
