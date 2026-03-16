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
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-3 sm:p-4 animate-fade-up stagger-4">
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-signal text-xs text-white/50" />
        <h3 className="text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">
          Market Regime
        </h3>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-white/[0.08] text-[#a1a1a1] ml-auto">
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
              <p className="text-sm font-bold" style={{ color: style.color }}>
                {style.label}
              </p>
              <p className="text-[10px] text-[#6b6b6b]">
                {regime.confidence != null
                  ? `${Number(regime.confidence).toFixed(0)}% confidence`
                  : '---'}
              </p>
            </div>
          </div>

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
                      className="flex items-center gap-2 text-xs animate-fade-up"
                      style={{ animationDelay: `${i * 0.06}s` }}
                    >
                      <span className="w-16 sm:w-20 text-[#6b6b6b] capitalize truncate text-[10px] sm:text-xs">
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
                      <span className="font-mono w-10 text-right text-[10px] text-[#a1a1a1]">
                        {prob != null ? `${(prob * 100).toFixed(0)}%` : '---'}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}

          <p className="text-[10px] text-[#6b6b6b] flex items-center gap-1">
            <i className="fa-solid fa-microchip text-[8px]" />
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
          <span className="text-xs text-[#6b6b6b]">Detecting regime...</span>
        </div>
      )}
    </div>
  );
}
