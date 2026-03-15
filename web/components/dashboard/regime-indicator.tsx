'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/api';
import type {
  MarketPrice,
  FearGreedData,
  TechnicalAnalysis,
  DerivativesData,
  RegimeResult,
} from '@/lib/types';

const REGIME_STYLES: Record<string, { color: string; label: string; icon: string }> = {
  trending_bull: { color: 'var(--success)', label: 'Trending Bull', icon: '\u2191' },
  trending_bear: { color: 'var(--danger)', label: 'Trending Bear', icon: '\u2193' },
  ranging: { color: 'var(--warning)', label: 'Ranging', icon: '\u2194' },
  volatile: { color: 'var(--accent-orange)', label: 'Volatile', icon: '\u26A1' },
  capitulation: { color: 'var(--danger)', label: 'Capitulation', icon: '\u2620' },
};

export function RegimeIndicator() {
  const { data: btc } = useApi<MarketPrice>('/v1/market/price/BTC');
  const { data: fg } = useApi<FearGreedData>('/v1/market/fear-greed');
  const { data: ta } = useApi<TechnicalAnalysis>('/v1/analysis/technical/BTC');
  const { data: deriv } = useApi<DerivativesData>('/v1/market/derivatives/BTC');
  const [regime, setRegime] = useState<RegimeResult | null>(null);

  useEffect(() => {
    if (!btc || !fg || !ta) return;
    const features = {
      returns_1d: btc.priceChange24h ?? 0,
      returns_7d: 0,
      volatility_14d: ta.indicators?.atr ? (ta.indicators.atr / btc.price) * 100 : 2,
      volume_ratio: 1,
      rsi: ta.indicators?.rsi ?? 50,
      bb_width: ta.indicators?.bollingerBands
        ? ((ta.indicators.bollingerBands.upper - ta.indicators.bollingerBands.lower) /
            ta.indicators.bollingerBands.middle) *
          100
        : 5,
      fear_greed: fg.current?.value ?? 50,
      funding_rate: deriv?.fundingRate ?? 0,
      price_vs_sma200: 0,
    };
    apiFetch<RegimeResult>('/v1/market/ml/regime', {
      method: 'POST',
      body: JSON.stringify(features),
    })
      .then((r) => {
        if (r && r.regime) setRegime(r);
      })
      .catch(() => setRegime(null));
  }, [btc, fg, ta, deriv]);

  const r = regime?.regime ?? 'ranging';
  const style = REGIME_STYLES[r] ?? REGIME_STYLES.ranging;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-xs font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Market Regime
      </h3>
      {regime ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl" style={{ color: style.color }}>
              {style.icon}
            </span>
            <div>
              <p className="text-sm font-bold" style={{ color: style.color }}>
                {style.label}
              </p>
              <p className="text-[10px] text-[var(--muted)]">
                {regime.confidence != null ? `${Number(regime.confidence).toFixed(0)}%` : '---'}{' '}
                confidence
              </p>
            </div>
          </div>
          {/* Probabilities */}
          {regime.probabilities && (
            <div className="space-y-1">
              {Object.entries(regime.probabilities)
                .sort(([, a], [, b]) => b - a)
                .map(([name, prob]) => {
                  const s = REGIME_STYLES[name];
                  return (
                    <div key={name} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-[var(--muted)] capitalize truncate">
                        {name.replace('_', ' ')}
                      </span>
                      <div className="flex-1 h-1 bg-[var(--background)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${prob * 100}%`,
                            background: s?.color ?? 'var(--muted)',
                          }}
                        />
                      </div>
                      <span className="font-mono w-10 text-right">
                        {prob != null ? `${(prob * 100).toFixed(0)}%` : '---'}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
          <p className="text-[10px] text-[var(--muted)]">Model: {regime.model}</p>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">Detecting regime...</p>
      )}
    </div>
  );
}
