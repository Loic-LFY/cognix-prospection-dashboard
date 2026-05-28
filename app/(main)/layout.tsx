import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1 max-w-screen-xl w-full mx-auto px-4 py-6">{children}</main>
      <Footer />
    </>
  );
}
