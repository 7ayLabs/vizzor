'use client';

import { useApi } from '@/hooks/use-api';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { Prediction } from '@/lib/types';

const SYMBOLS = ['BTC', 'ETH', 'SOL'];

const DIR_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  up: { icon: 'fa-solid fa-arrow-trend-up', color: 'var(--success)', label: 'Bullish' },
  down: { icon: 'fa-solid fa-arrow-trend-down', color: 'var(--danger)', label: 'Bearish' },
  sideways: { icon: 'fa-solid fa-arrows-left-right', color: 'var(--warning)', label: 'Ranging' },
};

function PredictionRow({ symbol, delay }: { symbol: string; delay: number }) {
  const { data } = useApi<Prediction>(`/v1/market/prediction?symbol=${symbol}`);

  if (!data) {
    return (
      <div className="flex items-center gap-3 py-2.5">
        <div className="flex items-center gap-1.5 w-16 shrink-0">
          <CryptoIcon symbol={symbol} size={16} className="opacity-30" />
          <span className="text-xs font-bold">{symbol}</span>
        </div>
        <div className="flex-1 h-1.5 bg-[var(--background)] rounded-full animate-shimmer" />
        <span className="text-[10px] text-[var(--muted)] w-10 text-right">---</span>
      </div>
    );
  }

  const style = DIR_STYLES[data.direction] ?? DIR_STYLES.sideways;
  const confidence = data.confidence;

  return (
    <div
      className="flex items-center gap-3 py-2.5 animate-fade-up"
      style={{ animationDelay: `${delay * 0.1}s` }}
    >
      <div className="flex items-center gap-1.5 w-16 shrink-0">
        <CryptoIcon symbol={symbol} size={16} />
        <span className="text-xs font-bold text-[var(--foreground)]">{symbol}</span>
      </div>
      <div className="flex items-center gap-1.5 w-20 sm:w-24">
        <i className={`${style.icon} text-[10px]`} style={{ color: style.color }} />
        <span className="text-[10px] font-medium" style={{ color: style.color }}>
          {style.label}
        </span>
      </div>
      <div className="flex-1 h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full animate-bar-fill"
          style={{
            width: `${confidence}%`,
            background: style.color,
            animationDelay: `${delay * 0.15}s`,
          }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right font-bold" style={{ color: style.color }}>
        {confidence.toFixed(0)}%
      </span>
    </div>
  );
}

export function PredictionOverview() {
  return (
    <div className="dash-card bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 sm:p-4 animate-fade-up stagger-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-wand-magic-sparkles text-xs text-[var(--primary)]" />
          <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
            Chronovisor
          </h3>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
          ML-POWERED
        </span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {SYMBOLS.map((sym, i) => (
          <PredictionRow key={sym} symbol={sym} delay={i} />
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-[var(--border)]">
        <p className="text-[10px] text-[var(--muted)]">
          <i className="fa-solid fa-circle-info text-[8px] mr-1" />
          Multi-signal: technical, sentiment, on-chain, derivatives
        </p>
      </div>
    </div>
  );
}
