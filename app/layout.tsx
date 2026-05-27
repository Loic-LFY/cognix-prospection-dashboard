import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cognix Prospection Dashboard',
  description: 'Suivi des leads et prospection LinkedIn — Cognix Systems',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.className} bg-gray-50 dark:bg-gray-900 min-h-screen flex flex-col`}>
        <Header />
        <main className="flex-1 max-w-screen-xl w-full mx-auto px-4 py-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
