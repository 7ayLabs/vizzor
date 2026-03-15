'use client';

import { useApi } from '@/hooks/use-api';
import type { MLHealth } from '@/lib/types';

export function MLStatus() {
  const { data } = useApi<MLHealth>('/v1/market/ml-health');

  const isOnline = data?.available === true;
  const models = data?.models ?? [];
  const loaded = models.filter((m) => m.loaded).length;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
          ML Sidecar
        </h3>
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
          <div className="space-y-1">
            {models.slice(0, 6).map((m) => (
              <div key={m.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${m.loaded ? 'bg-[var(--success)]' : 'bg-gray-600'}`}
                  />
                  <span className="text-[var(--foreground)] truncate max-w-[100px]">{m.name}</span>
                </div>
                <span className="text-[10px] font-mono text-[var(--muted)]">{m.version}</span>
              </div>
            ))}
            {models.length > 6 && (
              <p className="text-[10px] text-[var(--muted)]">+{models.length - 6} more models</p>
            )}
          </div>
          {/* Stats */}
          <div className="border-t border-[var(--border)] pt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">Models</span>
              <span className="font-mono">
                <span className="text-[var(--success)]">{loaded}</span>/{models.length}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">Uptime</span>
              <span className="font-mono">
                {Math.floor(data.uptime / 3600)}h {Math.floor((data.uptime % 3600) / 60)}m
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">Predictions</span>
              <span className="font-mono text-[var(--primary)]">
                {data.predictionsServed.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">ML sidecar not connected</p>
      )}
    </div>
  );
}
