'use client';

import { useApi } from '@/hooks/use-api';
import type { TechnicalAnalysis } from '@/lib/types';

function rsiColor(rsi: number): string {
  if (rsi >= 70) return 'var(--danger)';
  if (rsi <= 30) return 'var(--success)';
  return 'var(--foreground)';
}

function rsiZone(rsi: number): string {
  if (rsi >= 70) return 'Overbought';
  if (rsi <= 30) return 'Oversold';
  return 'Neutral';
}

function bbPosition(percentB: number): string {
  if (percentB >= 0.8) return 'upper';
  if (percentB <= 0.2) return 'lower';
  return 'middle';
}

export function TechnicalPanel({ symbol }: { symbol: string }) {
  const { data } = useApi<TechnicalAnalysis>(`/v1/analysis/technical/${symbol}`);

  const compositeScore = data?.composite?.score ?? 0;
  const compositeDir = data?.composite?.direction ?? 'neutral';
  const rsi = data?.indicators?.rsi;
  const macdHist = data?.indicators?.macd?.histogram;
  const macdDirection =
    macdHist != null ? (macdHist > 0 ? 'bullish' : macdHist < 0 ? 'bearish' : 'neutral') : null;
  const percentB = data?.indicators?.bollingerBands?.percentB;
  const bbPos = percentB != null ? bbPosition(percentB) : null;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-xs font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Technicals
      </h3>
      {data ? (
        <div className="space-y-2">
          {/* Composite score bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--muted)]">Composite</span>
              <span className="font-mono font-bold">{compositeScore}</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(Math.max(compositeScore, 0), 100)}%`,
                  background:
                    compositeScore >= 60
                      ? 'var(--success)'
                      : compositeScore <= 40
                        ? 'var(--danger)'
                        : 'var(--warning)',
                }}
              />
            </div>
          </div>

          {/* Direction */}
          <div className="flex justify-between text-xs">
            <span className="text-[var(--muted)]">Direction</span>
            <span
              className="font-mono capitalize"
              style={{
                color:
                  compositeDir === 'up' || compositeDir === 'bullish'
                    ? 'var(--success)'
                    : compositeDir === 'down' || compositeDir === 'bearish'
                      ? 'var(--danger)'
                      : 'var(--muted)',
              }}
            >
              {compositeDir}
            </span>
          </div>

          {rsi != null && (
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">RSI</span>
              <span className="font-mono">
                <span style={{ color: rsiColor(rsi) }}>{rsi.toFixed(1)}</span>
                <span className="text-[var(--muted)] ml-1">({rsiZone(rsi)})</span>
              </span>
            </div>
          )}

          {macdDirection != null && (
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">MACD</span>
              <span
                className="font-mono"
                style={{
                  color:
                    macdDirection === 'bullish'
                      ? 'var(--success)'
                      : macdDirection === 'bearish'
                        ? 'var(--danger)'
                        : 'var(--muted)',
                }}
              >
                {macdDirection}
              </span>
            </div>
          )}

          {bbPos != null && (
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">BB Position</span>
              <span className="font-mono">{bbPos}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">Loading...</p>
      )}
    </div>
  );
}
