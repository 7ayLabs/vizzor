'use client';

import { useState } from 'react';
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
    <div>
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-lg font-bold">Markets</h2>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <SymbolSelector value={symbol} onChange={setSymbol} />
        <div className="flex rounded overflow-hidden border border-[var(--border)]">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 text-xs ${
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
        <div className="flex flex-col items-center justify-center h-[300px] text-xs text-[var(--muted)]">
          <svg
            width="32"
            height="32"
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
