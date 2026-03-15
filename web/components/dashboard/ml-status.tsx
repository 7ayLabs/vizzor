'use client';

import { useApi } from '@/hooks/use-api';
import type { MLHealth } from '@/lib/types';

export function MLStatus() {
  const { data } = useApi<MLHealth>('/v1/market/ml-health');

  const isOnline = data?.available === true;
  const models = data?.models ?? [];
  const loaded = models.filter((m) => m.loaded).length;

  return (
    <div className="dash-card bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 sm:p-4 animate-fade-up stagger-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-microchip text-xs text-[var(--primary)]" />
          <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
            ML Sidecar
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--danger)]'}`}
          />
          <span
            className={`text-[10px] font-bold ${isOnline ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
          >
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>
      {isOnline ? (
        <div className="space-y-2.5">
          {/* Model grid */}
          <div className="space-y-1.5">
            {models.slice(0, 6).map((m, i) => (
              <div
                key={m.name}
                className="flex items-center justify-between text-xs animate-fade-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-center gap-1.5">
                  <i
                    className={`fa-solid fa-circle text-[5px] ${m.loaded ? 'text-[var(--success)]' : 'text-[var(--muted)]'}`}
                  />
                  <span className="text-[var(--foreground)] truncate max-w-[80px] sm:max-w-[100px]">
                    {m.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[var(--muted)]">{m.version}</span>
              </div>
            ))}
            {models.length > 6 && (
              <p className="text-[10px] text-[var(--muted)]">+{models.length - 6} more</p>
            )}
          </div>
          {/* Stats */}
          <div className="border-t border-[var(--border)] pt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)] flex items-center gap-1">
                <i className="fa-solid fa-cube text-[8px]" />
                Models
              </span>
              <span className="font-mono">
                <span className="text-[var(--success)]">{loaded}</span>/{models.length}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)] flex items-center gap-1">
                <i className="fa-solid fa-clock text-[8px]" />
                Uptime
              </span>
              <span className="font-mono">
                {Math.floor(data.uptime / 3600)}h {Math.floor((data.uptime % 3600) / 60)}m
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)] flex items-center gap-1">
                <i className="fa-solid fa-chart-simple text-[8px]" />
                Predictions
              </span>
              <span className="font-mono text-[var(--primary)]">
                {data.predictionsServed.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-3">
          <i className="fa-solid fa-plug text-xs text-[var(--muted)]" />
          <p className="text-xs text-[var(--muted)]">ML sidecar not connected</p>
        </div>
      )}
    </div>
  );
}
