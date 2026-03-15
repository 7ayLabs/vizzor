'use client';

import { useApi } from '@/hooks/use-api';
import type { MLHealth } from '@/lib/types';

interface ModelAccuracy {
  name: string;
  accuracy: number;
  lastPrediction?: string;
  lastActual?: string;
  latencyMs?: number;
  trainingStatus: 'trained' | 'training' | 'not_trained';
}

export function MLStatus() {
  const { data } = useApi<MLHealth>('/v1/market/ml-health');

  const isOnline = data?.available === true;
  const models = data?.models ?? [];
  const loaded = models.filter((m) => m.loaded).length;

  // Build per-model accuracy data from available information
  const modelMetrics: ModelAccuracy[] = models.map((m) => ({
    name: m.name,
    accuracy: ((m as Record<string, unknown>).accuracy as number) ?? 0,
    lastPrediction: (m as Record<string, unknown>).lastPrediction as string | undefined,
    lastActual: (m as Record<string, unknown>).lastActual as string | undefined,
    latencyMs: (m as Record<string, unknown>).latencyMs as number | undefined,
    trainingStatus: m.loaded
      ? 'trained'
      : ((m as Record<string, unknown>).training as boolean)
        ? 'training'
        : 'not_trained',
  }));

  const trainingStatusDot = (status: ModelAccuracy['trainingStatus']) => {
    switch (status) {
      case 'trained':
        return 'bg-[var(--success)]';
      case 'training':
        return 'bg-yellow-500 animate-pulse';
      case 'not_trained':
        return 'bg-[var(--text-muted)]';
    }
  };

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-3 sm:p-4 animate-fade-up stagger-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-microchip text-xs text-white/50" />
          <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
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
          {/* Model grid with accuracy */}
          <div className="space-y-1.5">
            {modelMetrics.slice(0, 6).map((m, i) => (
              <div
                key={m.name}
                className="flex items-center justify-between text-xs animate-fade-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${trainingStatusDot(m.trainingStatus)}`}
                    title={m.trainingStatus.replace('_', ' ')}
                  />
                  <span className="text-white truncate max-w-[80px] sm:max-w-[100px]">
                    {m.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {m.accuracy > 0 && (
                    <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                      {(m.accuracy * 100).toFixed(1)}%
                    </span>
                  )}
                  {m.latencyMs !== undefined && m.latencyMs > 0 && (
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      {m.latencyMs}ms
                    </span>
                  )}
                </div>
              </div>
            ))}
            {models.length > 6 && (
              <p className="text-[10px] text-[var(--text-muted)]">+{models.length - 6} more</p>
            )}
          </div>

          {/* Last prediction vs actual */}
          {modelMetrics.some((m) => m.lastPrediction) && (
            <div className="border-t border-white/[0.08] pt-2">
              <p className="text-[10px] text-[var(--text-muted)] mb-1 uppercase">Last Signal</p>
              {modelMetrics
                .filter((m) => m.lastPrediction)
                .slice(0, 2)
                .map((m) => (
                  <div
                    key={m.name}
                    className="flex items-center justify-between text-[10px] py-0.5"
                  >
                    <span className="text-[var(--text-secondary)]">{m.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-mono">{m.lastPrediction}</span>
                      {m.lastActual && (
                        <>
                          <span className="text-[var(--text-muted)]">/</span>
                          <span
                            className={`font-mono ${m.lastPrediction === m.lastActual ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                          >
                            {m.lastActual}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Stats */}
          <div className="border-t border-white/[0.08] pt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <i className="fa-solid fa-cube text-[8px]" />
                Models
              </span>
              <span className="font-mono text-white">
                <span className="text-[var(--success)]">{loaded}</span>/{models.length}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <i className="fa-solid fa-clock text-[8px]" />
                Uptime
              </span>
              <span className="font-mono text-white">
                {Math.floor(data.uptime / 3600)}h {Math.floor((data.uptime % 3600) / 60)}m
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--text-muted)] flex items-center gap-1">
                <i className="fa-solid fa-chart-simple text-[8px]" />
                Predictions
              </span>
              <span className="font-mono text-white">
                {data.predictionsServed.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-3">
          <i className="fa-solid fa-plug text-xs text-[var(--text-muted)]" />
          <p className="text-xs text-[var(--text-muted)]">ML sidecar not connected</p>
        </div>
      )}
    </div>
  );
}
