'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct, formatCompact } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { MarketPrice, FearGreedData } from '@/lib/types';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'] as const;
const STORAGE_KEY = 'vizzor:market-symbol';

interface MLPrediction {
  direction: string;
  confidence: number;
  score?: number;
}

const FG_ZONES = [
  { max: 20, label: 'Extreme Fear', color: '#ef4444' },
  { max: 40, label: 'Fear', color: '#a1a1a1' },
  { max: 60, label: 'Neutral', color: '#6b6b6b' },
  { max: 80, label: 'Greed', color: '#a1a1a1' },
  { max: 100, label: 'Extreme Greed', color: '#22c55e' },
];

function getFGStyle(value: number) {
  for (const z of FG_ZONES) if (value <= z.max) return z;
  return FG_ZONES[4];
}

function loadSymbol(): string {
  if (typeof window === 'undefined') return 'BTC';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SYMBOLS.includes(stored as (typeof SYMBOLS)[number])) return stored;
  } catch {
    // ignore
  }
  return 'BTC';
}

function saveSymbol(sym: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, sym);
  } catch {
    // quota exceeded etc.
  }
}

export function MarketOverview() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setSelectedSymbol(loadSymbol());
  }, []);

  const handleSelect = useCallback((sym: string) => {
    setSelectedSymbol(sym);
    saveSymbol(sym);
    setDropdownOpen(false);
  }, []);

  const { data: price } = useApi<MarketPrice>(`/v1/market/price/${selectedSymbol}`);
  const { data: fg } = useApi<FearGreedData>('/v1/market/fear-greed');
  const { data: mlPred } = useApi<MLPrediction>(
    `/v1/ml/prediction/${selectedSymbol.toLowerCase()}`,
  );

  const fgValue = fg?.current?.value ?? 50;
  const fgStyle = getFGStyle(fgValue);

  const mlDirection = mlPred?.direction;
  const mlConfidence = mlPred?.confidence;
  const mlIsUp = mlDirection === 'up' || mlDirection === 'bullish';
  const mlIsDown = mlDirection === 'down' || mlDirection === 'bearish';

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl animate-fade-up stagger-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-chart-line text-xs text-white/50" />
          <h3 className="dash-title">Market Stats</h3>
        </div>

        {/* Symbol selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((p) => !p)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] transition-colors text-xs text-white"
            aria-label="Select market symbol"
            aria-expanded={dropdownOpen}
          >
            <CryptoIcon symbol={selectedSymbol} size={14} />
            <span className="font-medium">{selectedSymbol}</span>
            <i
              className={`fa-solid fa-chevron-down text-[8px] text-[var(--text-muted)] transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {dropdownOpen && (
            <>
              {/* Backdrop to close dropdown on click outside */}
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 bg-[#1a1a1a] border border-white/[0.1] rounded-lg shadow-xl overflow-hidden min-w-[100px]">
                {SYMBOLS.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => handleSelect(sym)}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-white/[0.06] transition-colors ${sym === selectedSymbol ? 'text-white bg-white/[0.04]' : 'text-[var(--text-secondary)]'}`}
                  >
                    <CryptoIcon symbol={sym} size={14} />
                    {sym}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {/* Price */}
        <div>
          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
            <CryptoIcon symbol={selectedSymbol} size={12} />
            {selectedSymbol} Price
          </p>
          <p className="text-base sm:text-lg font-mono font-bold text-white">
            {price?.price != null ? formatUsd(price.price) : '---'}
          </p>
        </div>

        {/* 24h Change */}
        <div>
          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
            <i className="fa-solid fa-arrow-right-arrow-left text-[8px]" />
            24h Change
          </p>
          <p
            className="text-base sm:text-lg font-mono font-bold"
            style={{
              color:
                price?.priceChange24h != null
                  ? price.priceChange24h >= 0
                    ? 'var(--success)'
                    : 'var(--danger)'
                  : undefined,
            }}
          >
            {price?.priceChange24h != null ? formatPct(price.priceChange24h) : '---'}
          </p>
        </div>

        {/* Volume */}
        <div>
          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
            <i className="fa-solid fa-chart-bar text-[8px]" />
            24h Volume
          </p>
          <p className="text-base sm:text-lg font-mono font-bold text-white">
            {price?.volume24h != null ? `$${formatCompact(price.volume24h)}` : '---'}
          </p>
        </div>

        {/* Market Cap */}
        <div>
          <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
            <i className="fa-solid fa-coins text-[8px]" />
            Market Cap
          </p>
          <p className="text-base sm:text-lg font-mono font-bold text-white">
            {price?.marketCap != null ? `$${formatCompact(price.marketCap)}` : '---'}
          </p>
        </div>
      </div>

      {/* Fear & Greed bar */}
      <div className="mt-3 pt-3 border-t border-white/[0.08]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
            <i className="fa-solid fa-gauge text-[8px]" />
            Fear & Greed
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-mono font-bold" style={{ color: fgStyle.color }}>
              {fg ? fgValue : '---'}
            </span>
            <span className="text-[10px]" style={{ color: fgStyle.color }}>
              {fg ? fgStyle.label : ''}
            </span>
          </div>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-bar-fill"
            style={{ width: `${fgValue}%`, background: fgStyle.color }}
          />
        </div>
      </div>

      {/* ML Prediction row */}
      {mlPred && mlDirection && mlConfidence != null && (
        <div className="mt-3 pt-3 border-t border-white/[0.08]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
              <i className="fa-solid fa-microchip text-[8px]" />
              ML Prediction
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <i
                  className={`fa-solid ${mlIsUp ? 'fa-arrow-trend-up' : mlIsDown ? 'fa-arrow-trend-down' : 'fa-arrows-left-right'} text-xs`}
                  style={{
                    color: mlIsUp ? 'var(--success)' : mlIsDown ? 'var(--danger)' : '#a1a1a1',
                  }}
                />
                <span
                  className="text-sm font-bold capitalize"
                  style={{
                    color: mlIsUp ? 'var(--success)' : mlIsDown ? 'var(--danger)' : '#a1a1a1',
                  }}
                >
                  {mlDirection}
                </span>
              </div>
              <span className="text-sm font-mono font-bold text-white/70">
                {mlConfidence.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
