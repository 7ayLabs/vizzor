'use client';

import { CryptoIcon } from '@/components/ui/crypto-icon';

interface PredictionData {
  symbol?: string;
  direction?: string;
  confidence?: number;
  composite?: { direction?: string; score?: number; confidence?: number } | number;
  signals?: Record<string, number> | { name: string; value: number; strength: string }[];
  reasoning?: string[];
}

export function PredictionCard({ result }: { result: unknown }) {
  const data = result as PredictionData;
  if (!data || typeof data !== 'object') return null;

  const direction =
    data.direction ??
    (typeof data.composite === 'object' ? data.composite?.direction : undefined) ??
    'sideways';
  const confidence =
    data.confidence ??
    (typeof data.composite === 'object' ? data.composite?.confidence : undefined) ??
    0;
  const pct = Math.round(confidence * 100);

  const dirColor =
    direction === 'up' || direction === 'bullish'
      ? '--success'
      : direction === 'down' || direction === 'bearish'
        ? '--danger'
        : '--warning';

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold inline-flex items-center gap-1.5">
          {data.symbol && <CryptoIcon symbol={data.symbol} size={16} />}
          {data.symbol ?? 'Prediction'}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full uppercase"
          style={{ color: `var(${dirColor})`, background: `var(${dirColor})15` }}
        >
          {direction}
        </span>
      </div>

      {/* Confidence bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-[var(--muted)] mb-1">
          <span>Confidence</span>
          <span className="font-mono">{pct}%</span>
        </div>
        <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: `var(${dirColor})` }}
          />
        </div>
      </div>

      {/* Signals */}
      {data.signals && !Array.isArray(data.signals) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          {Object.entries(data.signals).map(([key, val]) => (
            <div key={key} className="flex justify-between">
              <span className="text-[var(--muted)] capitalize">{key.replace(/_/g, ' ')}</span>
              <span
                className={`font-mono ${val > 0 ? 'text-[var(--success)]' : val < 0 ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}
              >
                {typeof val === 'number' ? val.toFixed(2) : String(val)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
