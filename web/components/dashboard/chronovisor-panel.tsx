'use client';

import { useApi } from '@/hooks/use-api';

interface SignalCategory {
  name: string;
  weight: number;
  score: number;
  confidence: number;
}

interface ChronoVisorData {
  symbol: string;
  composite: {
    score: number;
    direction: string;
    confidence: number;
    signalBreakdown: Record<string, SignalCategory>;
  };
  accuracy: { overall: number } | null;
}

export function ChronoVisorPanel({ symbol = 'BTC' }: { symbol?: string }) {
  const { data, isLoading } = useApi<ChronoVisorData>(`/v1/chronovisor/${symbol}`);

  if (isLoading || !data) {
    return (
      <div className="glass-card p-4 space-y-3">
        <div className="text-sm font-medium text-white">ChronoVisor</div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-6 rounded bg-white/[0.06] animate-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  const { composite } = data;
  const signals = composite.signalBreakdown;
  const signalEntries = Object.values(signals);

  const directionColor =
    composite.direction === 'bullish'
      ? 'text-[var(--success)]'
      : composite.direction === 'bearish'
        ? 'text-[var(--danger)]'
        : 'text-[var(--text-secondary)]';

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-white">ChronoVisor -- {symbol}</div>
        {data.accuracy && (
          <span className="text-xs text-[var(--text-muted)]">
            {(data.accuracy.overall * 100).toFixed(1)}% accuracy
          </span>
        )}
      </div>

      {/* Composite Score */}
      <div className="flex items-center gap-3">
        <div className={`text-2xl font-bold ${directionColor}`}>
          {composite.score > 0 ? '+' : ''}
          {(composite.score * 100).toFixed(0)}
        </div>
        <div>
          <div className={`text-sm font-medium ${directionColor}`}>
            {composite.direction.charAt(0).toUpperCase() + composite.direction.slice(1)}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {composite.confidence.toFixed(0)}% confidence
          </div>
        </div>
      </div>

      {/* Signal Breakdown */}
      <div className="space-y-2">
        {signalEntries.map((signal) => {
          const barWidth = Math.abs(signal.score) * signal.weight * 100;
          const isPositive = signal.score >= 0;
          return (
            <div key={signal.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{signal.name}</span>
                <span className="text-[var(--text-muted)]">
                  {(signal.weight * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isPositive ? 'bg-[var(--success)]/60' : 'bg-[var(--danger)]/60'}`}
                  style={{ width: `${Math.min(barWidth, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
