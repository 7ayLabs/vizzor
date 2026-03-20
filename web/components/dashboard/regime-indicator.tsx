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
  trending_bull: {
    color: 'var(--success)',
    label: 'Trending Bull',
    icon: 'fa-solid fa-arrow-trend-up',
  },
  trending_bear: {
    color: 'var(--danger)',
    label: 'Trending Bear',
    icon: 'fa-solid fa-arrow-trend-down',
  },
  ranging: { color: '#a1a1a1', label: 'Ranging', icon: 'fa-solid fa-arrows-left-right' },
  volatile: { color: '#a1a1a1', label: 'Volatile', icon: 'fa-solid fa-bolt' },
  capitulation: { color: 'var(--danger)', label: 'Capitulation', icon: 'fa-solid fa-skull' },
};

/** ML market regime response from the dedicated endpoint. */
interface MLMarketRegime {
  regime: string;
  confidence: number;
  drivers?: { name: string; weight: number; direction: string }[];
  model?: string;
}

export function RegimeIndicator() {
  const { data: btc } = useApi<MarketPrice>('/v1/market/price/BTC');
  const { data: fg } = useApi<FearGreedData>('/v1/market/fear-greed');
  const { data: ta } = useApi<TechnicalAnalysis>('/v1/analysis/technical/BTC');
  const { data: deriv } = useApi<DerivativesData>('/v1/market/derivatives/BTC');
  const [regime, setRegime] = useState<RegimeResult | null>(null);

  // ML regime from dedicated endpoint
  const { data: mlRegime } = useApi<MLMarketRegime>('/v1/ml/market-regime');

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

  // ML regime styling
  const mlStyle = mlRegime?.regime
    ? (REGIME_STYLES[mlRegime.regime] ?? REGIME_STYLES.ranging)
    : null;

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl animate-fade-up stagger-4">
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-signal text-xs text-white/50" />
        <h3 className="dash-title">Market Regime</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/[0.08] text-[#a1a1a1] ml-auto">
          HMM
        </span>
      </div>
      {regime ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-lg bg-white/[0.06]">
              <i className={`${style.icon} text-base`} style={{ color: style.color }} />
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: style.color }}>
                {style.label}
              </p>
              <p className="text-sm text-[#6b6b6b]">
                {regime.confidence != null
                  ? `${Number(regime.confidence).toFixed(0)}% confidence`
                  : '---'}
              </p>
            </div>
          </div>

          {/* ML Regime (if available and differs from HMM or provides extra data) */}
          {mlRegime && mlStyle && (
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <i className="fa-solid fa-microchip text-[10px] text-[var(--text-muted)]" />
                <span className="text-xs text-[var(--text-muted)]">ML Regime</span>
                {mlRegime.model && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-[var(--text-muted)] font-mono ml-auto">
                    {mlRegime.model}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <i className={`${mlStyle.icon} text-sm`} style={{ color: mlStyle.color }} />
                <span className="text-sm font-bold" style={{ color: mlStyle.color }}>
                  {mlStyle.label}
                </span>
                <span className="text-sm font-mono text-white/60 ml-auto">
                  {mlRegime.confidence.toFixed(0)}%
                </span>
              </div>

              {/* Signal drivers */}
              {mlRegime.drivers && mlRegime.drivers.length > 0 && (
                <div className="mt-2 space-y-1">
                  <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">
                    Signal Drivers
                  </span>
                  {mlRegime.drivers.slice(0, 5).map((driver, i) => {
                    const driverColor =
                      driver.direction === 'bullish'
                        ? 'var(--success)'
                        : driver.direction === 'bearish'
                          ? 'var(--danger)'
                          : '#a1a1a1';
                    const barPct = Math.max(0, Math.min(100, Math.abs(driver.weight) * 100));
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-sm text-[var(--text-muted)] truncate capitalize">
                          {driver.name.replace(/_/g, ' ')}
                        </span>
                        <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${barPct}%`, background: driverColor }}
                          />
                        </div>
                        <span
                          className="text-sm font-mono w-8 text-right"
                          style={{ color: driverColor }}
                        >
                          {(driver.weight * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Probabilities */}
          {regime.probabilities && (
            <div className="space-y-1.5">
              {Object.entries(regime.probabilities)
                .sort(([, a], [, b]) => b - a)
                .map(([name, prob], i) => {
                  const s = REGIME_STYLES[name];
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-2 text-sm animate-fade-up"
                      style={{ animationDelay: `${i * 0.06}s` }}
                    >
                      <span className="w-20 text-[var(--text-muted)] capitalize truncate text-sm">
                        {name.replace('_', ' ')}
                      </span>
                      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full animate-bar-fill"
                          style={{
                            width: `${prob * 100}%`,
                            background: s?.color ?? '#6b6b6b',
                            animationDelay: `${i * 0.1}s`,
                          }}
                        />
                      </div>
                      <span className="font-mono w-12 text-right text-sm text-[#a1a1a1]">
                        {prob != null ? `${(prob * 100).toFixed(0)}%` : '---'}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}

          <p className="text-xs text-[#6b6b6b] flex items-center gap-1">
            <i className="fa-solid fa-microchip text-[9px]" />
            {regime.model}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-4">
          <span className="inline-flex gap-0.5">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          <span className="text-sm text-[#6b6b6b]">Detecting regime...</span>
        </div>
      )}
    </div>
  );
}
