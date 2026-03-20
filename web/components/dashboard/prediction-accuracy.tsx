'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { PredictionAccuracy } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants & Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'vizzor:accuracy:tracked-symbols';
const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'];

/** Horizons in display order with their label + color. */
const HORIZONS: { key: string; label: string; color: string }[] = [
  { key: '5m', label: '5M', color: 'rgba(255,255,255,0.6)' },
  { key: '15m', label: '15M', color: 'rgba(255,255,255,0.55)' },
  { key: '30m', label: '30M', color: 'rgba(255,255,255,0.5)' },
  { key: '1h', label: '1H', color: 'rgba(255,255,255,0.45)' },
  { key: '4h', label: '4H', color: 'rgba(255,255,255,0.4)' },
  { key: '1d', label: '1D', color: 'rgba(255,255,255,0.3)' },
  { key: '7d', label: '7D', color: 'rgba(255,255,255,0.2)' },
];

function loadTrackedSymbols(): string[] {
  if (typeof window === 'undefined') return DEFAULT_SYMBOLS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SYMBOLS;
}

function saveTrackedSymbols(symbols: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // quota exceeded etc.
  }
}

// ---------------------------------------------------------------------------
// Types for "My Predictions" data
// ---------------------------------------------------------------------------

interface PredictionEntry {
  id?: string;
  symbol: string;
  direction: 'up' | 'down' | 'sideways';
  confidence: number;
  compositeScore?: number;
  initialPrice?: number;
  createdAt: string;
  resolvedAt?: string | null;
  actualDirection?: string | null;
  status: 'pending' | 'correct' | 'incorrect' | 'expired';
  horizon?: string;
}

interface PredictionHistoryResponse {
  predictions: PredictionEntry[];
}

// ---------------------------------------------------------------------------
// AccuracyRing -- reusable SVG ring gauge
// ---------------------------------------------------------------------------

function AccuracyRing({
  value,
  size = 48,
  strokeWidth = 4,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth - 2) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circ - (clamped / 100) * circ;
  const color = value >= 70 ? 'var(--success)' : value >= 50 ? '#eab308' : 'var(--danger)';

  return (
    <svg
      width={size}
      height={size}
      className="shrink-0"
      aria-label={`Accuracy: ${value.toFixed(0)}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700"
      />
      <text
        x={size / 2}
        y={size / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={size * 0.24}
        fontWeight="bold"
        fontFamily="monospace"
      >
        {clamped.toFixed(0)}%
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HorizonBar -- small colored accuracy bar for a single horizon
// ---------------------------------------------------------------------------

function HorizonBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${pct.toFixed(1)}%`}>
      <span className="text-[9px] font-mono text-[var(--text-muted)] w-5 text-right shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full animate-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[9px] font-mono text-white/60 w-8 text-right shrink-0">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SymbolAccuracyCard -- per-token accuracy card
// ---------------------------------------------------------------------------

function SymbolAccuracyCard({ symbol, delay }: { symbol: string; delay: number }) {
  const { data, error } = useApi<PredictionAccuracy>(`/v1/chronovisor/${symbol}/accuracy`, {
    refreshInterval: 60000,
  });

  // Loading skeleton
  if (!data && !error) {
    return (
      <div
        className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-fade-up"
        style={{ animationDelay: `${delay * 0.06}s` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/[0.06] animate-shimmer" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-16 bg-white/[0.06] rounded animate-shimmer" />
            <div className="h-2 w-24 bg-white/[0.06] rounded animate-shimmer" />
            <div className="h-2 w-20 bg-white/[0.06] rounded animate-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-fade-up"
        style={{ animationDelay: `${delay * 0.06}s` }}
      >
        <div className="flex items-center gap-2">
          <CryptoIcon symbol={symbol} size={16} className="opacity-40" />
          <span className="text-xs font-medium text-white/40">{symbol}</span>
          <span className="text-[10px] text-[var(--danger)]">Failed to load</span>
        </div>
      </div>
    );
  }

  // Still no data after error guard
  if (!data) return null;

  const overall = parseFloat(data.accuracy.overall);
  const total = data.accuracy.total_resolved;
  const correct = data.accuracy.correct;
  const pending = data.pending_predictions;
  const horizonEntries = data.accuracy.by_horizon;

  // No resolved predictions yet
  if (total === 0) {
    return (
      <div
        className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-fade-up"
        style={{ animationDelay: `${delay * 0.06}s` }}
      >
        <div className="flex items-center gap-2.5">
          <CryptoIcon symbol={symbol} size={18} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-white">{symbol}</span>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {pending > 0 ? `${pending} pending -- awaiting horizon expiry` : 'No predictions yet'}
            </p>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--text-muted)] font-medium">
            {pending > 0 ? 'PENDING' : 'WAITING'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-all animate-fade-up"
      style={{ animationDelay: `${delay * 0.06}s` }}
    >
      <div className="flex items-start gap-3">
        {/* Ring */}
        <AccuracyRing value={overall} size={52} />

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <CryptoIcon symbol={symbol} size={14} />
            <span className="text-sm font-bold text-white">{symbol}</span>
            <span className="text-xs text-[var(--text-muted)] font-mono">
              {correct}/{total}
            </span>
            {pending > 0 && (
              <span className="text-[9px] px-1 py-px rounded bg-white/[0.06] text-[var(--text-muted)]">
                +{pending} pending
              </span>
            )}
          </div>

          {/* Horizon bars */}
          <div className="space-y-0.5">
            {HORIZONS.map((h) => {
              const rawVal = horizonEntries[h.key];
              if (rawVal === undefined) return null;
              const numVal = parseFloat(rawVal);
              return <HorizonBar key={h.key} label={h.label} value={numVal} color={h.color} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlobalSummaryRow -- top summary with overall accuracy
// ---------------------------------------------------------------------------

function GlobalSummaryRow() {
  const { data } = useApi<PredictionAccuracy>('/v1/chronovisor/stats/resolver', {
    refreshInterval: 60000,
  });

  if (!data) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-14 h-14 rounded-full bg-white/[0.06] animate-shimmer" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 bg-white/[0.06] rounded animate-shimmer" />
          <div className="h-2 w-32 bg-white/[0.06] rounded animate-shimmer" />
        </div>
      </div>
    );
  }

  const overall = parseFloat(data.accuracy.overall);
  const total = data.accuracy.total_resolved;
  const correct = data.accuracy.correct;
  const pending = data.pending_predictions;
  const isActive = data.resolver_active;
  const isLearning = data.feedback_loop.startsWith('ACTIVE');

  return (
    <div className="flex items-center gap-3 pb-3 mb-3 border-b border-white/[0.06]">
      <AccuracyRing value={total > 0 ? overall : 0} size={56} strokeWidth={5} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-white">Global Accuracy</span>
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--danger)]'}`}
          />
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/[0.08] text-[var(--text-secondary)]">
            {isLearning ? 'LEARNING' : isActive ? 'RESOLVING' : 'INACTIVE'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-[var(--text-muted)]">
            <span className="text-white font-mono">{correct}</span>/{total} correct
          </span>
          {pending > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              <span className="text-white font-mono">{pending}</span> pending
            </span>
          )}
        </div>
        {/* Learned weights row */}
        {data.learned_weights && (
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
            {Object.entries(data.learned_weights).map(([key, weight]) => (
              <span key={key} className="text-[9px] font-mono text-[var(--text-muted)]">
                {key}: <span className="text-white/70">{weight}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MyPredictions -- user prediction history section
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { color: string; label: string; bg: string }> = {
  pending: { color: '#a1a1a1', label: 'Pending', bg: 'rgba(255,255,255,0.06)' },
  correct: { color: 'var(--success)', label: 'Correct', bg: 'var(--success-bg)' },
  incorrect: { color: 'var(--danger)', label: 'Incorrect', bg: 'var(--danger-bg)' },
  expired: { color: '#6b6b6b', label: 'Expired', bg: 'rgba(107,107,107,0.15)' },
};

function formatPrice(price: number | undefined | null): string {
  if (!price || price <= 0) return '';
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toPrecision(4)}`;
}

/** Convert horizon string to seconds. */
const HORIZON_SECONDS: Record<string, number> = {
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '7d': 604800,
};

/** Format an ISO timestamp to local HH:MM:SS. */
function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Format an ISO timestamp to local date + time for older predictions. */
function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return formatLocalTime(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + formatLocalTime(iso)
  );
}

/** Compute expiry time from createdAt + horizon. */
function computeExpiryTime(createdAt: string, horizon: string): string {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return '';
  const secs = HORIZON_SECONDS[horizon] ?? 0;
  if (secs === 0) return '';
  const expiry = new Date(created.getTime() + secs * 1000);
  return formatLocalDateTime(expiry.toISOString());
}

/** Check if a prediction has expired based on createdAt + horizon. */
function isExpired(createdAt: string, horizon: string): boolean {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return false;
  const secs = HORIZON_SECONDS[horizon] ?? 0;
  return Date.now() > created.getTime() + secs * 1000;
}

/** Compute remaining time until expiry. */
function remainingTime(createdAt: string, horizon: string): string {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return '';
  const secs = HORIZON_SECONDS[horizon] ?? 0;
  const expiryMs = created.getTime() + secs * 1000;
  const remainMs = expiryMs - Date.now();
  if (remainMs <= 0) return 'expired';
  const remainSec = Math.floor(remainMs / 1000);
  if (remainSec < 60) return `${remainSec}s left`;
  if (remainSec < 3600) return `${Math.floor(remainSec / 60)}m left`;
  if (remainSec < 86400) return `${Math.floor(remainSec / 3600)}h left`;
  return `${Math.floor(remainSec / 86400)}d left`;
}

function MyPredictions() {
  const { data, error } = useApi<PredictionHistoryResponse>('/v1/chronovisor/predictions', {
    refreshInterval: 30000,
  });

  const predictions = data?.predictions ?? [];

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-[var(--text-muted)]">Could not load prediction history</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-5 h-5 rounded-full bg-white/[0.06] animate-shimmer" />
            <div className="flex-1 h-3 bg-white/[0.06] rounded animate-shimmer" />
            <div className="w-12 h-3 bg-white/[0.06] rounded animate-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="text-center py-4">
        <i className="fa-solid fa-chart-line text-lg text-white/10 mb-2 block" />
        <p className="text-xs text-[var(--text-muted)]">
          No predictions yet. Ask the AI to predict any token to see history here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {predictions.slice(0, 15).map((pred, i) => {
        const dir = pred.direction ?? 'sideways';
        const dirColor =
          dir === 'up' ? 'var(--success)' : dir === 'down' ? 'var(--danger)' : '#a1a1a1';
        const dirIcon =
          dir === 'up'
            ? 'fa-solid fa-arrow-trend-up'
            : dir === 'down'
              ? 'fa-solid fa-arrow-trend-down'
              : 'fa-solid fa-arrows-left-right';
        const dirLabel = dir === 'up' ? 'Bullish' : dir === 'down' ? 'Bearish' : 'Sideways';
        const statusStyle = STATUS_STYLES[pred.status] ?? STATUS_STYLES.pending;
        const confidence = typeof pred.confidence === 'number' ? pred.confidence : 0;

        // Actual result for resolved predictions
        const actualDir = pred.actualDirection;
        const actualColor =
          actualDir === 'up'
            ? 'var(--success)'
            : actualDir === 'down'
              ? 'var(--danger)'
              : '#a1a1a1';
        const actualLabel =
          actualDir === 'up'
            ? 'UP'
            : actualDir === 'down'
              ? 'DOWN'
              : actualDir === 'sideways'
                ? 'FLAT'
                : null;

        const priceStr = formatPrice(pred.initialPrice);
        const createdTime = pred.createdAt ? formatLocalDateTime(pred.createdAt) : '';
        const expiryTime =
          pred.createdAt && pred.horizon ? computeExpiryTime(pred.createdAt, pred.horizon) : '';
        const isPending = pred.status === 'pending';
        const remaining =
          isPending && pred.createdAt && pred.horizon
            ? remainingTime(pred.createdAt, pred.horizon)
            : '';
        const hasExpired =
          isPending && pred.createdAt && pred.horizon
            ? isExpired(pred.createdAt, pred.horizon)
            : false;

        return (
          <div
            key={pred.id ?? `${pred.symbol}-${i}`}
            className="p-2 rounded-lg border border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08] transition-all"
          >
            {/* Top row: symbol + prediction direction + horizon + status */}
            <div className="flex items-center gap-2">
              <CryptoIcon symbol={pred.symbol ?? '?'} size={16} />
              <span className="text-sm font-bold text-white">{pred.symbol ?? '?'}</span>

              {/* Prediction summary */}
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04]">
                <i className={`${dirIcon} text-[10px]`} style={{ color: dirColor }} />
                <span className="text-[10px] font-bold" style={{ color: dirColor }}>
                  {dirLabel}
                </span>
                <span className="text-[10px] font-mono text-white/50">
                  {confidence.toFixed(0)}%
                </span>
              </div>

              {pred.horizon && (
                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-white/[0.06] text-[var(--text-muted)]">
                  {pred.horizon}
                </span>
              )}

              <span className="flex-1" />

              {/* Countdown for pending predictions */}
              {isPending && remaining && !hasExpired && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-[var(--text-secondary)]">
                  {remaining}
                </span>
              )}
              {isPending && hasExpired && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-yellow-500">
                  resolving...
                </span>
              )}

              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{ color: statusStyle.color, background: statusStyle.bg }}
              >
                {statusStyle.label}
              </span>
            </div>

            {/* Bottom row: timestamps + price + actual result */}
            <div className="flex items-center gap-2 mt-1 ml-6 flex-wrap">
              {/* Created → Expires timeline */}
              {createdTime && (
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {createdTime}
                </span>
              )}
              {expiryTime && (
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  → {expiryTime}
                </span>
              )}
              {priceStr && (
                <span className="text-[10px] text-[var(--text-muted)]">@ {priceStr}</span>
              )}
              {actualLabel && (
                <span className="text-[10px] font-mono" style={{ color: actualColor }}>
                  → Actual: {actualLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PredictionAccuracyPanel() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [addInput, setAddInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<'accuracy' | 'history'>('accuracy');

  // Load persisted symbols on mount
  useEffect(() => {
    setSymbols(loadTrackedSymbols());
  }, []);

  const handleAddSymbol = useCallback(() => {
    const sym = addInput.trim().toUpperCase();
    if (!sym || symbols.includes(sym)) {
      setAddInput('');
      setShowAdd(false);
      return;
    }
    const next = [...symbols, sym];
    setSymbols(next);
    saveTrackedSymbols(next);
    setAddInput('');
    setShowAdd(false);
  }, [addInput, symbols]);

  const handleRemoveSymbol = useCallback(
    (sym: string) => {
      const next = symbols.filter((s) => s !== sym);
      setSymbols(next);
      saveTrackedSymbols(next);
    },
    [symbols],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleAddSymbol();
      if (e.key === 'Escape') {
        setShowAdd(false);
        setAddInput('');
      }
    },
    [handleAddSymbol],
  );

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl animate-fade-up stagger-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-bullseye text-xs text-white/50" />
          <h3 className="dash-title">Prediction Accuracy</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Add symbol button */}
          {showAdd ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={addInput}
                onChange={(e) => setAddInput(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                placeholder="SYM"
                autoFocus
                className="w-14 bg-white/[0.06] border border-white/[0.08] rounded px-1.5 py-0.5 text-xs text-white outline-none focus:border-white/[0.2]"
              />
              <button
                onClick={handleAddSymbol}
                className="text-[10px] text-[var(--success)] hover:text-white transition-colors"
                aria-label="Confirm add symbol"
              >
                <i className="fa-solid fa-check" />
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setAddInput('');
                }}
                className="text-[10px] text-[var(--text-muted)] hover:text-white transition-colors"
                aria-label="Cancel add symbol"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="text-[10px] text-[var(--text-muted)] hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.06]"
              aria-label="Track new symbol"
            >
              <i className="fa-solid fa-plus text-[8px] mr-0.5" />
              Track
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-white/[0.04]">
        <button
          onClick={() => setActiveTab('accuracy')}
          className={`flex-1 text-xs py-1.5 px-3 rounded-md font-medium transition-colors ${
            activeTab === 'accuracy'
              ? 'bg-white/[0.08] text-white'
              : 'text-[var(--text-muted)] hover:text-white/70'
          }`}
        >
          Accuracy
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 text-xs py-1.5 px-3 rounded-md font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-white/[0.08] text-white'
              : 'text-[var(--text-muted)] hover:text-white/70'
          }`}
        >
          My Predictions
        </button>
      </div>

      {activeTab === 'accuracy' ? (
        <>
          {/* Global summary */}
          <GlobalSummaryRow />

          {/* Empty state */}
          {symbols.length === 0 ? (
            <div className="text-center py-6">
              <i className="fa-solid fa-chart-simple text-lg text-white/10 mb-2" />
              <p className="text-sm text-[var(--text-muted)]">No tokens tracked for accuracy.</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Run predictions via chat to see accuracy tracking here.
              </p>
              <button
                onClick={() => {
                  setSymbols(DEFAULT_SYMBOLS);
                  saveTrackedSymbols(DEFAULT_SYMBOLS);
                }}
                className="mt-2 text-xs text-[var(--text-secondary)] hover:text-white transition-colors"
              >
                <i className="fa-solid fa-rotate-right text-[9px] mr-1" />
                Restore defaults (BTC, ETH, SOL)
              </button>
            </div>
          ) : (
            <>
              {/* Tracked symbols chips */}
              <div className="flex flex-wrap gap-1 mb-3">
                {symbols.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[10px] text-[var(--text-secondary)] group"
                  >
                    <CryptoIcon symbol={sym} size={10} />
                    {sym}
                    <button
                      onClick={() => handleRemoveSymbol(sym)}
                      className="text-[10px] text-white/20 group-hover:text-[var(--danger)] transition-colors ml-0.5"
                      aria-label={`Remove ${sym}`}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Per-token accuracy grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {symbols.map((sym, i) => (
                  <SymbolAccuracyCard key={sym} symbol={sym} delay={i} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        /* My Predictions tab */
        <MyPredictions />
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-white/[0.06]">
        <p className="text-xs text-[var(--text-muted)]">
          <i className="fa-solid fa-rotate text-[9px] mr-1" />
          Predictions resolve after horizon expires (5m/15m/30m/1h/4h/1d/7d) -- weights auto-adapt
          from verified outcomes
        </p>
      </div>
    </div>
  );
}
