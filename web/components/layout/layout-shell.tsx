'use client';

import { useState, useCallback } from 'react';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationToast } from '@/components/ui/notification-toast';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast, dismissToast } = useNotifications();

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <>
      <Header onMenuClick={toggleSidebar} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      {toast && <NotificationToast notification={toast} onDismiss={dismissToast} />}
    </>
  );
}
