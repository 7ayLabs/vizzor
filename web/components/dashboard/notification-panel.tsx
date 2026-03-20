'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications, useAlertRules } from '@/hooks/use-notifications';
import { Modal } from '@/components/ui/modal';
import { SmartAlertModal } from '@/components/ui/price-alert-modal';
import type { NotificationItem } from '@/lib/types';

const SEVERITY_COLORS: Record<string, string> = {
  info: 'var(--primary)',
  warning: 'var(--warning)',
  critical: 'var(--danger)',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - ts;
  if (diffMs < 60000) return 'just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NotificationRow({
  n,
  onMarkRead,
  onClose,
}: {
  n: NotificationItem;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const color = SEVERITY_COLORS[n.severity] ?? 'var(--primary)';
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${n.read ? 'opacity-40' : 'hover:bg-white/[0.04]'}`}
      onClick={() => {
        if (!n.read) onMarkRead(n.id);
        onClose();
      }}
    >
      <div
        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
        style={{ background: n.read ? 'transparent' : color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{n.title}</span>
          {n.symbol && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
              {n.symbol}
            </span>
          )}
        </div>
        <p className="text-xs text-white/40 truncate mt-0.5">{n.message}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-white/30">{formatTime(n.createdAt)}</span>
        {!n.read && (
          <button
            onClick={() => onMarkRead(n.id)}
            className="text-[10px] text-white/30 hover:text-white/60"
            title="Mark read"
          >
            <i className="fa-solid fa-check" />
          </button>
        )}
      </div>
    </div>
  );
}

export function NotificationPanel() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'alerts'>('all');
  const bellRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateDropdownPos = useCallback(() => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  // Recalculate position on scroll/resize with rAF throttle
  useEffect(() => {
    if (!isOpen) return;
    updateDropdownPos();

    let rafId = 0;
    const onScrollOrResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        updateDropdownPos();
        rafId = 0;
      });
    };

    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isOpen, updateDropdownPos]);

  const dropdown =
    isOpen && mounted
      ? createPortal(
          <>
            {/* Backdrop to close on click outside */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 9998 }}
              onClick={() => setIsOpen(false)}
            />
            <div
              className="fixed w-96 max-h-[500px] rounded-xl overflow-hidden"
              style={{
                top: dropdownPos.top,
                right: dropdownPos.right,
                zIndex: 9999,
                background: 'rgba(15, 15, 20, 0.95)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`text-xs font-medium px-2.5 py-1 rounded ${activeTab === 'all' ? 'bg-white/10 text-white' : 'text-white/40'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setActiveTab('alerts')}
                    className={`text-xs font-medium px-2.5 py-1 rounded ${activeTab === 'alerts' ? 'bg-white/10 text-white' : 'text-white/40'}`}
                  >
                    Alert Rules
                  </button>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => void markAllRead()}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* Content */}
              <div className="max-h-[420px] overflow-y-auto">
                {activeTab === 'all' ? (
                  notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-white/30">
                      No notifications yet
                    </div>
                  ) : (
                    <div className="py-1">
                      {notifications.map((n) => (
                        <NotificationRow
                          key={n.id}
                          n={n}
                          onMarkRead={(id) => void markRead(id)}
                          onClose={() => setIsOpen(false)}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <AlertRulesTab />
                )}
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      {/* Bell button */}
      <div className="relative">
        <button
          ref={bellRef}
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-1.5 rounded hover:bg-white/[0.06] transition-colors"
          aria-label="Notifications"
        >
          <i className="fa-solid fa-bell text-sm text-white/60" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5"
              style={{ background: 'var(--danger)', color: '#fff' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Portal dropdown */}
      {dropdown}
    </>
  );
}

function AlertRulesTab() {
  const { rules, toggleRule, deleteRule } = useAlertRules();
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <>
      {rules.length === 0 ? (
        <div className="p-4 text-center text-[11px] text-white/30">
          No alert rules configured.
          <br />
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-2 px-3 py-1 rounded-lg border border-white/[0.08] text-[10px] text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <i className="fa-solid fa-plus mr-1" />
            Create alert rule
          </button>
        </div>
      ) : (
        <div className="py-1">
          <div className="flex justify-end px-3 py-1">
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-[10px] text-white/40 hover:text-white transition-colors"
              title="New rule"
            >
              <i className="fa-solid fa-plus mr-1" />
              New rule
            </button>
          </div>
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
            >
              <button
                onClick={() => void toggleRule(rule.id, !rule.enabled)}
                className={`text-sm ${rule.enabled ? 'text-[var(--success)]' : 'text-white/20'}`}
                title={rule.enabled ? 'Disable' : 'Enable'}
              >
                <i className={`fa-solid ${rule.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}`} />
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">{rule.type.replace(/_/g, ' ')}</span>
                {rule.symbols && (
                  <span className="text-[9px] text-white/40 ml-1">[{rule.symbols.join(', ')}]</span>
                )}
                {rule.priceAbove != null && (
                  <span className="text-[9px] text-white/40 ml-1">
                    &gt;${rule.priceAbove.toLocaleString()}
                  </span>
                )}
                {rule.priceBelow != null && (
                  <span className="text-[9px] text-white/40 ml-1">
                    &lt;${rule.priceBelow.toLocaleString()}
                  </span>
                )}
              </div>
              <button
                onClick={() => void deleteRule(rule.id)}
                className="text-xs text-white/30 hover:text-[var(--danger)]"
                title="Delete rule"
              >
                <i className="fa-solid fa-trash" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} maxWidth="max-w-md">
        <SmartAlertModal onClose={() => setShowCreateModal(false)} />
      </Modal>
    </>
  );
}
