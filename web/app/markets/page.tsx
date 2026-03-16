'use client';

import { useState } from 'react';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import { SymbolSelector } from '@/components/markets/symbol-selector';
import { PredictionPanel } from '@/components/markets/prediction-panel';
import { DerivativesPanel } from '@/components/markets/derivatives-panel';
import { TechnicalPanel } from '@/components/markets/technical-panel';
import { RegimeIndicator } from '@/components/dashboard/regime-indicator';

const TIMEFRAMES = ['1h', '4h', '1d', '1w'];

export default function MarketsPage() {
  const [symbol, setSymbol] = useState('BTC');
  const [timeframe, setTimeframe] = useState('4h');

  return (
    <div className="p-3 sm:p-5">
      <div className="flex items-center gap-2 mb-4 sm:mb-5">
        <CryptoIcon symbol={symbol} size={20} />
        <h2 className="text-base sm:text-lg font-bold">Markets</h2>
        <span className="text-xs text-[var(--muted)] font-mono">{symbol}</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <SymbolSelector value={symbol} onChange={setSymbol} />
        <div className="flex rounded overflow-hidden border border-[var(--border)]">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs touch-target ${
                timeframe === tf
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart placeholder — candles endpoint not available */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 mb-4">
        <div className="flex flex-col items-center justify-center h-[200px] sm:h-[300px] text-xs text-[var(--muted)]">
          <svg
            width="24"
            height="24"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="mb-2 opacity-50"
          >
            <polyline points="1,12 4,7 7,9 10,4 15,6" />
            <line x1="1" y1="15" x2="15" y2="15" />
          </svg>
          <span>
            {symbol}/{timeframe} Chart
          </span>
          <span className="text-[10px] mt-1">Candlestick data endpoint coming soon</span>
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PredictionPanel symbol={symbol} />
        <div className="space-y-4">
          <DerivativesPanel symbol={symbol} />
          <TechnicalPanel symbol={symbol} />
        </div>
        <RegimeIndicator />
      </div>
    </div>
  );
}
