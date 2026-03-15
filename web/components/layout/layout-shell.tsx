'use client';

import { useState, useCallback } from 'react';
import { Header } from './header';
import { Sidebar } from './sidebar';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <>
      <Header onMenuClick={toggleSidebar} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </>
  );
}
