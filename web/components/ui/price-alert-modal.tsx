'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAlertRules } from '@/hooks/use-notifications';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { AlertRuleItem } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  price_threshold: {
    icon: 'fa-solid fa-chart-line',
    color: 'var(--text-secondary)',
    label: 'Price Alert',
  },
  pump_detected: { icon: 'fa-solid fa-bolt', color: 'var(--warning)', label: 'Pump / Dump' },
  agent_decision: {
    icon: 'fa-solid fa-robot',
    color: 'var(--text-secondary)',
    label: 'Agent Action',
  },
  prediction_accuracy_milestone: {
    icon: 'fa-solid fa-bullseye',
    color: 'var(--success)',
    label: 'Accuracy',
  },
  smart_money_signal: { icon: 'fa-solid fa-eye', color: 'var(--primary)', label: 'Smart Money' },
  balance_low: { icon: 'fa-solid fa-wallet', color: 'var(--danger)', label: 'Low Balance' },
  risk_event: { icon: 'fa-solid fa-shield-halved', color: 'var(--danger)', label: 'Risk Event' },
};

function describeRule(rule: AlertRuleItem): string {
  const parts: string[] = [];
  if (rule.priceAbove != null) parts.push(`above $${rule.priceAbove.toLocaleString()}`);
  if (rule.priceBelow != null) parts.push(`below $${rule.priceBelow.toLocaleString()}`);
  if (rule.pumpSeverity?.length) parts.push(`severity: ${rule.pumpSeverity.join(', ')}`);
  if (rule.agentActions?.length) parts.push(`actions: ${rule.agentActions.join(', ')}`);
  if (rule.accuracyMilestone != null) parts.push(`milestone: ${rule.accuracyMilestone}%`);
  return parts.join(' · ') || rule.type.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// AlertRuleCard — single rule with toggle
// ---------------------------------------------------------------------------

function AlertRuleCard({
  rule,
  onToggle,
  onDelete,
  toggling,
}: {
  rule: AlertRuleItem;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  toggling: string | null;
}) {
  const meta = TYPE_META[rule.type] ?? {
    icon: 'fa-solid fa-bell',
    color: 'var(--text-muted)',
    label: rule.type.replace(/_/g, ' '),
  };
  const isToggling = toggling === rule.id;
  const symbol = rule.symbols?.[0];

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all ${
        rule.enabled
          ? 'border-white/[0.1] bg-white/[0.04]'
          : 'border-transparent bg-white/[0.01] opacity-60'
      }`}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        {symbol ? (
          <CryptoIcon symbol={symbol} size={14} />
        ) : (
          <i className={`${meta.icon} text-[10px]`} style={{ color: meta.color }} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-white truncate">{meta.label}</span>
          {rule.symbols?.map((s) => (
            <span
              key={s}
              className="text-[9px] px-1 py-px rounded bg-white/[0.08] text-white/50 font-mono"
            >
              {s}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{describeRule(rule)}</p>
      </div>

      {/* Toggle */}
      <button
        onClick={() => onToggle(rule.id, !rule.enabled)}
        disabled={isToggling}
        className={`shrink-0 text-lg transition-colors ${
          isToggling ? 'opacity-40' : ''
        } ${rule.enabled ? 'text-[var(--success)]' : 'text-white/20 hover:text-white/40'}`}
        aria-label={rule.enabled ? 'Disable alert' : 'Enable alert'}
      >
        <i className={`fa-solid ${rule.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}`} />
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(rule.id)}
        className="shrink-0 text-[9px] text-white/10 hover:text-[var(--danger)] transition-colors"
        aria-label="Delete alert"
      >
        <i className="fa-solid fa-trash" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface SmartAlertModalProps {
  onClose: () => void;
}

/**
 * Smart Alert Modal — displays auto-created alerts from predictions.
 * Alerts are pre-populated by the backend when the user runs predictions
 * (get_prediction tool auto-creates price threshold + pump detection rules).
 * The user just toggles them on/off.
 */
export function SmartAlertModal({ onClose }: SmartAlertModalProps) {
  const { rules, toggleRule, deleteRule, isLoading } = useAlertRules();
  const [toggling, setToggling] = useState<string | null>(null);

  // Group rules by symbol (null = global rules)
  const grouped = useMemo(() => {
    const bySymbol = new Map<string, AlertRuleItem[]>();

    for (const rule of rules) {
      const key = rule.symbols?.[0]?.toUpperCase() ?? '_global';
      const list = bySymbol.get(key) ?? [];
      list.push(rule);
      bySymbol.set(key, list);
    }

    // Sort: symbol groups first (alphabetical), global last
    const entries = Array.from(bySymbol.entries()).sort((a, b) => {
      if (a[0] === '_global') return 1;
      if (b[0] === '_global') return -1;
      return a[0].localeCompare(b[0]);
    });

    return entries;
  }, [rules]);

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      setToggling(id);
      try {
        await toggleRule(id, enabled);
      } finally {
        setToggling(null);
      }
    },
    [toggleRule],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteRule(id);
    },
    [deleteRule],
  );

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <i className="fa-solid fa-bell text-sm text-white/50" />
          Alerts
        </h3>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--success)] font-medium font-mono">
              {activeCount} active
            </span>
          )}
          <button
            onClick={onClose}
            className="text-sm text-[var(--text-muted)] hover:text-white transition-colors"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-white/[0.04] animate-shimmer" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && rules.length === 0 && (
        <div className="text-center py-8">
          <i className="fa-solid fa-wand-magic-sparkles text-2xl text-white/10 mb-3 block" />
          <p className="text-[11px] text-[var(--text-secondary)]">No alerts yet</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed max-w-[220px] mx-auto">
            Ask for a prediction in chat and alerts will be created automatically based on the
            analysis.
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-2 italic">
            Try: &ldquo;Give me a prediction for BTC&rdquo;
          </p>
        </div>
      )}

      {/* Alert rules grouped by symbol */}
      {!isLoading && rules.length > 0 && (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-0.5">
          {grouped.map(([key, groupRules]) => (
            <div key={key}>
              {/* Group header */}
              <div className="flex items-center gap-1.5 mb-1.5 px-1">
                {key !== '_global' ? (
                  <>
                    <CryptoIcon symbol={key} size={12} />
                    <span className="text-[10px] font-bold text-white">{key}</span>
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {groupRules.filter((r) => r.enabled).length}/{groupRules.length} on
                    </span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-globe text-[9px] text-[var(--text-muted)]" />
                    <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Global
                    </span>
                  </>
                )}
              </div>

              {/* Rules */}
              <div className="space-y-1">
                {groupRules.map((rule) => (
                  <AlertRuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={(id, enabled) => void handleToggle(id, enabled)}
                    onDelete={(id) => void handleDelete(id)}
                    toggling={toggling}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer hint */}
      {!isLoading && rules.length > 0 && (
        <div className="pt-2 border-t border-white/[0.06]">
          <p className="text-[10px] text-[var(--text-muted)]">
            <i className="fa-solid fa-wand-magic-sparkles text-[8px] mr-1" />
            Alerts are auto-created when you run predictions — just toggle them on or off
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Legacy wrapper for call sites that pass `symbol` + `initialPrice` props
 * (e.g. trade-action-card). Renders the same alert management modal.
 */
export function PriceAlertModal({
  symbol: _symbol,
  initialPrice: _initialPrice,
  onClose,
}: {
  symbol: string;
  initialPrice?: number;
  onClose: () => void;
}) {
  return <SmartAlertModal onClose={onClose} />;
}
