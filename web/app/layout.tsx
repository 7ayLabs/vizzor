import type { Metadata } from 'next';
import './globals.css';
import { TickerBar } from '@/components/dashboard/ticker-bar';
import { Sidebar } from '@/components/layout/sidebar';

export const metadata: Metadata = {
  title: 'Vizzor Mission Control',
  description: 'AI-powered crypto intelligence dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen" suppressHydrationWarning>
        <TickerBar />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-5 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
