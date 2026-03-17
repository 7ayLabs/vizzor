'use client';

import { useApi } from '@/hooks/use-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationItem, AlertRuleItem } from '@/lib/types';
import { API_BASE } from '@/lib/constants';

/** Toast auto-dismiss duration. Configurable via NEXT_PUBLIC_TOAST_DISMISS_MS env var. */
const TOAST_DISMISS_MS = Number(process.env.NEXT_PUBLIC_TOAST_DISMISS_MS) || 5000;

interface UseNotificationsResult {
  notifications: NotificationItem[];
  unreadCount: number;
  isLoading: boolean;
  toast: NotificationItem | null;
  notifPermission: NotificationPermission;
  dismissToast: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refetch: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const { data, isLoading, mutate } = useApi<NotificationItem[]>('/v1/notifications?limit=50', {
    refreshInterval: 30000,
  });
  const { data: countData, mutate: mutateCount } = useApi<{ count: number }>(
    '/v1/notifications/unread/count',
    { refreshInterval: 15000 },
  );

  const [toast, setToast] = useState<NotificationItem | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const prevCountRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifications = data ?? [];
  const unreadCount = countData?.count ?? 0;

  // Request OS notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission()
          .then((perm) => {
            setNotifPermission(perm);
          })
          .catch(() => {
            // Permission request rejected or unavailable — leave as default
          });
      }
    }
  }, []);

  // Show toast + OS notification when unread count increases
  useEffect(() => {
    if (unreadCount > prevCountRef.current && notifications.length > 0) {
      const newest = notifications.find((n) => !n.read);
      if (newest) {
        setToast(newest);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          setToast(null);
          toastTimerRef.current = null;
        }, TOAST_DISMISS_MS);

        // Fire OS-level notification if permission granted
        if (notifPermission === 'granted') {
          try {
            new Notification(newest.title, {
              body: newest.message,
              icon: '/favicon.ico',
              tag: newest.id,
            });
          } catch {
            // OS notification not supported in this context (e.g. some mobile browsers)
          }
        }
      }
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, notifications, notifPermission]);

  const dismissToast = useCallback(() => {
    setToast(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      await fetch(`${API_BASE}/v1/notifications/${id}/read`, { method: 'POST' });
      void mutate();
      void mutateCount();
    },
    [mutate, mutateCount],
  );

  const markAllRead = useCallback(async () => {
    await fetch(`${API_BASE}/v1/notifications/read-all`, { method: 'POST' });
    void mutate();
    void mutateCount();
  }, [mutate, mutateCount]);

  const refetch = useCallback(() => {
    void mutate();
    void mutateCount();
  }, [mutate, mutateCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    toast,
    notifPermission,
    dismissToast,
    markRead,
    markAllRead,
    refetch,
  };
}

interface UseAlertRulesResult {
  rules: AlertRuleItem[];
  isLoading: boolean;
  createRule: (rule: Partial<AlertRuleItem>) => Promise<void>;
  toggleRule: (id: string, enabled: boolean) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  refetch: () => void;
}

export function useAlertRules(): UseAlertRulesResult {
  const { data, isLoading, mutate } = useApi<AlertRuleItem[]>('/v1/alerts', {
    refreshInterval: 60000,
  });

  const rules = data ?? [];

  const createRule = useCallback(
    async (rule: Partial<AlertRuleItem>) => {
      await fetch(`${API_BASE}/v1/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      void mutate();
    },
    [mutate],
  );

  const toggleRule = useCallback(
    async (id: string, enabled: boolean) => {
      await fetch(`${API_BASE}/v1/alerts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      void mutate();
    },
    [mutate],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await fetch(`${API_BASE}/v1/alerts/${id}`, { method: 'DELETE' });
      void mutate();
    },
    [mutate],
  );

  const refetch = useCallback(() => {
    void mutate();
  }, [mutate]);

  return { rules, isLoading, createRule, toggleRule, deleteRule, refetch };
}
