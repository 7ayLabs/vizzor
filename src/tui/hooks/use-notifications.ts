// ---------------------------------------------------------------------------
// useNotifications — TUI hook for notification integration
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Notification, NotificationConfig } from '../../notifications/types.js';

interface UseNotificationsResult {
  toast: Notification | null;
  unreadCount: number;
  dismissToast: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const [toast, setToast] = useState<Notification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef<NotificationConfig | null>(null);

  const dismissToast = useCallback(() => {
    setToast(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const init = async (): Promise<void> => {
      try {
        const { registerTUICallback, getNotificationConfig } =
          await import('../../notifications/service.js');
        const { getUnreadCount } = await import('../../notifications/store.js');

        const config = getNotificationConfig();
        configRef.current = config;

        // Register for live notifications
        cleanup = registerTUICallback((notification: Notification) => {
          setToast(notification);
          setUnreadCount((prev) => prev + 1);

          // Auto-dismiss
          if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = setTimeout(() => {
            setToast(null);
            dismissTimerRef.current = null;
          }, config.toastDismissMs);
        });

        // Initial unread count
        setUnreadCount(getUnreadCount());

        // Poll for catch-up (alerts while TUI was closed)
        pollTimer = setInterval(() => {
          try {
            setUnreadCount(getUnreadCount());
          } catch {
            // Store not available
          }
        }, config.pollIntervalMs);
      } catch {
        // Notification module not available
      }
    };

    void init();

    return () => {
      cleanup?.();
      if (pollTimer) clearInterval(pollTimer);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  return { toast, unreadCount, dismissToast };
}
