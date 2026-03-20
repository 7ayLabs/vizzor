'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { Prediction, PredictionAccuracy } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants & Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'vizzor:predictions:tracked-symbols';
const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'];

/** The six signal categories in display order. */
const SIGNAL_KEYS: { key: string; label: string; shortLabel: string }[] = [
  { key: 'technical', label: 'Technical Analysis', shortLabel: 'TECH' },
  { key: 'sentiment', label: 'Sentiment / Social', shortLabel: 'SENT' },
  { key: 'derivatives', label: 'Derivatives Data', shortLabel: 'DERIV' },
  { key: 'trend', label: 'Trend Strength', shortLabel: 'TREND' },
  { key: 'macro', label: 'Macro Conditions', shortLabel: 'MACRO' },
  { key: 'blockchain', label: 'On-Chain Metrics', shortLabel: 'CHAIN' },
];

const DIR_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  up: { icon: 'fa-solid fa-arrow-trend-up', color: 'var(--success)', label: 'Bullish' },
  down: { icon: 'fa-solid fa-arrow-trend-down', color: 'var(--danger)', label: 'Bearish' },
  sideways: { icon: 'fa-solid fa-arrows-left-right', color: '#a1a1a1', label: 'Ranging' },
};

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
// SignalBar -- mini bar for an individual signal score
// ---------------------------------------------------------------------------

function SignalBar({
  label,
  shortLabel,
  score,
}: {
  label: string;
  shortLabel: string;
  score: number;
}) {
  // score is typically -100 to +100 or 0-100; we normalize to 0-100 for display
  const normalized = Math.max(0, Math.min(100, (score + 100) / 2));
  const color =
    score > 20 ? 'var(--success)' : score < -20 ? 'var(--danger)' : 'rgba(255,255,255,0.4)';

  return (
    <div
      className="flex items-center gap-1.5"
      title={`${label}: ${score > 0 ? '+' : ''}${score.toFixed(1)}`}
    >
      <span className="text-[8px] font-mono text-[var(--text-muted)] w-8 text-right shrink-0 uppercase">
        {shortLabel}
      </span>
      <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${normalized}%`, background: color }}
        />
      </div>
      <span className="text-[8px] font-mono w-6 text-right shrink-0" style={{ color }}>
        {score > 0 ? '+' : ''}
        {score.toFixed(0)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PredictionRow -- single token prediction (hero-sized)
// ---------------------------------------------------------------------------

function PredictionRow({
  symbol,
  delay,
  onRemove,
}: {
  symbol: string;
  delay: number;
  onRemove: (sym: string) => void;
}) {
  const { data, error } = useApi<Prediction>(`/v1/market/prediction?symbol=${symbol}`);
  const { data: acc } = useApi<PredictionAccuracy>(`/v1/chronovisor/${symbol}/accuracy`, {
    refreshInterval: 60000,
  });
  const [expanded, setExpanded] = useState(false);

  // Loading skeleton
  if (!data && !error) {
    return (
      <div
        className="flex items-center gap-3 py-2.5 animate-fade-up"
        style={{ animationDelay: `${delay * 0.1}s` }}
      >
        <div className="flex items-center gap-2 w-20 shrink-0">
          <CryptoIcon symbol={symbol} size={16} className="opacity-30" />
          <span className="text-xs font-bold text-white">{symbol}</span>
        </div>
        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full animate-shimmer" />
        <span className="text-xs text-[var(--text-muted)] w-12 text-right">---</span>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div
        className="flex items-center gap-3 py-2.5 animate-fade-up"
        style={{ animationDelay: `${delay * 0.1}s` }}
      >
        <div className="flex items-center gap-2 w-20 shrink-0">
          <CryptoIcon symbol={symbol} size={16} className="opacity-30" />
          <span className="text-xs font-bold text-white/50">{symbol}</span>
        </div>
        <span className="text-[11px] text-[var(--danger)]">Failed to load prediction</span>
        <button
          onClick={() => onRemove(symbol)}
          className="ml-auto text-xs text-white/20 hover:text-[var(--danger)] hover:bg-white/[0.06] rounded p-1 transition-all"
          aria-label={`Remove ${symbol}`}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
    );
  }

  const style = DIR_STYLES[data.direction] ?? DIR_STYLES.sideways;
  const confidence = data.confidence;
  const hasAccuracy = acc && acc.accuracy.total_resolved > 0;
  const overallAcc = hasAccuracy ? parseFloat(acc.accuracy.overall) : null;
  const signals = data.signals ?? {};
  const hasSignals = Object.keys(signals).length > 0;

  return (
    <div className="animate-fade-up" style={{ animationDelay: `${delay * 0.1}s` }}>
      {/* Main row */}
      <div
        className={`flex items-center gap-3 py-2.5 ${hasSignals ? 'cursor-pointer hover:bg-white/[0.02] -mx-1.5 px-1.5 rounded-lg' : ''} transition-colors`}
        onClick={hasSignals ? () => setExpanded((p) => !p) : undefined}
        role={hasSignals ? 'button' : undefined}
        aria-expanded={hasSignals ? expanded : undefined}
        aria-label={
          hasSignals ? `${expanded ? 'Collapse' : 'Expand'} ${symbol} signal breakdown` : undefined
        }
      >
        {/* Symbol */}
        <div className="flex items-center gap-2 w-20 shrink-0">
          <CryptoIcon symbol={symbol} size={16} />
          <span className="text-xs font-bold text-white">{symbol}</span>
        </div>

        {/* Direction */}
        <div className="flex items-center gap-1.5 w-24 sm:w-28">
          <i className={`${style.icon} text-xs`} style={{ color: style.color }} />
          <span className="text-sm sm:text-base font-bold" style={{ color: style.color }}>
            {style.label}
          </span>
        </div>

        {/* Confidence bar */}
        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-bar-fill"
            style={{
              width: `${confidence}%`,
              background: style.color,
              animationDelay: `${delay * 0.15}s`,
            }}
          />
        </div>

        {/* Confidence value */}
        <span
          className="text-sm sm:text-base font-mono w-14 text-right font-bold"
          style={{ color: style.color }}
        >
          {confidence.toFixed(0)}%
        </span>

        {/* Signal mini indicators (6 dots) */}
        {hasSignals && (
          <div
            className="hidden sm:flex items-center gap-px shrink-0"
            title="Signal strength breakdown"
          >
            {SIGNAL_KEYS.map((sk) => {
              const val = typeof signals[sk.key] === 'number' ? (signals[sk.key] as number) : 0;
              const dotColor =
                val > 20 ? 'bg-[var(--success)]' : val < -20 ? 'bg-[var(--danger)]' : 'bg-white/20';
              return (
                <span key={sk.key} className={`inline-block w-1.5 h-4 rounded-sm ${dotColor}`} />
              );
            })}
          </div>
        )}

        {/* Accuracy badge */}
        {overallAcc !== null && acc ? (
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
            style={{
              color:
                overallAcc >= 70
                  ? 'var(--success)'
                  : overallAcc >= 50
                    ? '#eab308'
                    : 'var(--danger)',
              background: 'rgba(255,255,255,0.06)',
            }}
            title={`${acc.accuracy.correct}/${acc.accuracy.total_resolved} verified correct`}
          >
            {overallAcc.toFixed(0)}% hit
          </span>
        ) : acc && acc.pending_predictions > 0 ? (
          <span
            className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0 text-[var(--text-muted)] bg-white/[0.04]"
            title={`${acc.pending_predictions} predictions awaiting verification`}
          >
            verifying
          </span>
        ) : null}

        {/* Expand chevron */}
        {hasSignals && (
          <i
            className={`fa-solid fa-chevron-down text-[9px] text-[var(--text-muted)] transition-transform duration-200 shrink-0 ${expanded ? 'rotate-180' : ''}`}
          />
        )}

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(symbol);
          }}
          className="text-xs text-white/20 hover:text-[var(--danger)] hover:bg-white/[0.06] rounded p-1 transition-all shrink-0"
          aria-label={`Remove ${symbol} from tracking`}
          title={`Remove ${symbol}`}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Expanded signal breakdown */}
      {expanded && hasSignals && (
        <div className="ml-[5.5rem] mb-1.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] animate-fade-up space-y-0.5">
          <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
            Signal Breakdown
          </div>
          {SIGNAL_KEYS.map((sk) => {
            const val = typeof signals[sk.key] === 'number' ? (signals[sk.key] as number) : 0;
            return (
              <SignalBar key={sk.key} label={sk.label} shortLabel={sk.shortLabel} score={val} />
            );
          })}
          {data.reasoning && data.reasoning.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/[0.04]">
              <div className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                Reasoning
              </div>
              {data.reasoning.slice(0, 3).map((r, i) => (
                <p key={i} className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PredictionOverview() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [addInput, setAddInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);

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
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl animate-fade-up stagger-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-wand-magic-sparkles text-xs text-white/50" />
          <h3 className="dash-title">Chronovisor</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Add token button */}
          {showAdd ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={addInput}
                onChange={(e) => setAddInput(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                placeholder="SYM"
                autoFocus
                className="w-16 bg-white/[0.06] border border-white/[0.08] rounded px-2 py-1 text-xs text-white outline-none focus:border-white/[0.2]"
              />
              <button
                onClick={handleAddSymbol}
                className="text-xs text-[var(--success)] hover:text-white transition-colors"
                aria-label="Confirm add token"
              >
                <i className="fa-solid fa-check" />
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setAddInput('');
                }}
                className="text-xs text-[var(--text-muted)] hover:text-white transition-colors"
                aria-label="Cancel add token"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="text-xs text-[var(--text-muted)] hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/[0.06]"
              aria-label="Add token to track"
            >
              <i className="fa-solid fa-plus text-[9px] mr-1" />
              Add token
            </button>
          )}
          <span className="text-[10px] px-2 py-1 rounded font-medium bg-white/[0.08] text-[var(--text-secondary)]">
            ML-POWERED
          </span>
        </div>
      </div>

      {/* Token rows or empty state */}
      {symbols.length === 0 ? (
        <div className="text-center py-6">
          <i className="fa-solid fa-wand-magic-sparkles text-lg text-white/10 mb-2 block" />
          <p className="text-xs text-[var(--text-muted)]">No tokens being tracked.</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            Click &ldquo;Add token&rdquo; or run predictions via chat.
          </p>
          <button
            onClick={() => {
              setSymbols(DEFAULT_SYMBOLS);
              saveTrackedSymbols(DEFAULT_SYMBOLS);
            }}
            className="mt-3 text-xs text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            <i className="fa-solid fa-rotate-right text-[9px] mr-1" />
            Restore defaults
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {symbols.map((sym, i) => (
            <PredictionRow key={sym} symbol={sym} delay={i} onRemove={handleRemoveSymbol} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-white/[0.06]">
        <p className="text-[10px] text-[var(--text-muted)]">
          <i className="fa-solid fa-shield-halved text-[8px] mr-1" />
          Verified after horizon expires
          {symbols.length > 0 && <span className="ml-1.5">-- click to expand signals</span>}
        </p>
      </div>
    </div>
  );
}
