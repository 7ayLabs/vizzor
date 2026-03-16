'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import type { Prediction } from '@/lib/types';

const DIRECTION_STYLES: Record<string, { bg: string; text: string }> = {
  up: { bg: 'var(--success-bg)', text: 'var(--success)' },
  down: { bg: 'var(--danger-bg)', text: 'var(--danger)' },
  sideways: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--warning)' },
};

function signalStrength(value: number): { label: string; color: string } {
  const abs = Math.abs(value);
  if (abs >= 3) return { label: 'strong', color: 'var(--success)' };
  if (abs >= 1) return { label: 'moderate', color: 'var(--warning)' };
  return { label: 'weak', color: 'var(--muted)' };
}

export function PredictionPanel({ symbol }: { symbol: string }) {
  const { data } = useApi<Prediction>(`/v1/analysis/ml/${symbol}`);
  const [showReasoning, setShowReasoning] = useState(false);

  const dir = data?.direction ?? 'sideways';
  const style = DIRECTION_STYLES[dir] ?? DIRECTION_STYLES.sideways;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
          AI Prediction
        </h3>
        {data && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${data.mlAvailable ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--warning)]/15 text-[var(--warning)]'}`}
          >
            {data.mlAvailable ? 'ML' : 'Rules'}
          </span>
        )}
      </div>
      {data ? (
        <div className="space-y-3">
          {/* Direction badge */}
          <div className="flex items-center gap-3">
            <span
              className="text-sm px-2.5 py-1 rounded font-bold uppercase"
              style={{ background: style.bg, color: style.text }}
            >
              {dir}
            </span>
            <span className="text-xs text-[var(--muted)] inline-flex items-center gap-1">
              {symbol} &middot; {data.timeframe ?? '7d'}
            </span>
          </div>

          {/* Confidence bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--muted)]">Confidence</span>
              <span className="font-mono font-bold">{data.confidence}%</span>
            </div>
            <div className="w-full h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${data.confidence}%`,
                  background: style.text,
                }}
              />
            </div>
          </div>

          {/* Composite score */}
          <div className="flex justify-between text-xs">
            <span className="text-[var(--muted)]">Composite Score</span>
            <span className="font-mono font-bold">{data.composite}</span>
          </div>

          {/* Signals — object with named numeric values */}
          {data.signals && Object.keys(data.signals).length > 0 && (
            <div className="border-t border-[var(--border)] pt-2 space-y-1">
              <p className="text-[10px] text-[var(--muted)] uppercase">Signals</p>
              {Object.entries(data.signals).map(([name, value]) => {
                const strength = signalStrength(value);
                return (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className="capitalize">{name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">
                        {typeof value === 'number' ? value.toFixed(2) : value}
                      </span>
                      <span className="text-[10px] px-1 rounded" style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reasoning toggle — array of strings */}
          {data.reasoning && data.reasoning.length > 0 && (
            <div className="border-t border-[var(--border)] pt-2">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="text-[10px] text-[var(--primary)] hover:underline"
              >
                {showReasoning ? 'Hide' : 'Show'} reasoning
              </button>
              {showReasoning && (
                <ul className="text-xs text-[var(--muted)] mt-1 leading-relaxed space-y-1 list-disc list-inside">
                  {data.reasoning.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">Loading prediction...</p>
      )}
    </div>
  );
}
