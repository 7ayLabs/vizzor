'use client';

import type { NotificationItem } from '@/lib/types';

interface NotificationToastProps {
  notification: NotificationItem;
  onDismiss: () => void;
}

const SEVERITY_STYLES: Record<string, { border: string; icon: string; color: string }> = {
  info: { border: 'var(--primary)', icon: 'fa-circle-info', color: 'var(--primary)' },
  warning: { border: 'var(--warning)', icon: 'fa-triangle-exclamation', color: 'var(--warning)' },
  critical: { border: 'var(--danger)', icon: 'fa-circle-exclamation', color: 'var(--danger)' },
};

export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const style = SEVERITY_STYLES[notification.severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      className="fixed top-4 right-4 max-w-sm animate-slide-in-right"
      style={{
        zIndex: 10001,
        borderLeft: `3px solid ${style.border}`,
        background: 'rgba(15, 15, 20, 0.95)',
        backdropFilter: 'blur(12px)',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div className="flex items-start gap-2">
        <i className={`fa-solid ${style.icon} text-xs mt-0.5`} style={{ color: style.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold truncate">{notification.title}</span>
            {notification.symbol && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                {notification.symbol}
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/60 mt-0.5 line-clamp-2">{notification.message}</p>
        </div>
        <button
          onClick={onDismiss}
          className="text-white/30 hover:text-white/60 transition-colors text-xs"
          aria-label="Dismiss"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
    </div>
  );
}
