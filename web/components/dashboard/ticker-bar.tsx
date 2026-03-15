'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct } from '@/lib/utils';
import type { MarketPrice } from '@/lib/types';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];

function TickerItem({ symbol }: { symbol: string }) {
  const { data } = useApi<MarketPrice>(`/v1/market/price/${symbol}`, { refreshInterval: 15000 });
  const change = data?.priceChange24h ?? 0;
  const isUp = change >= 0;

  return (
    <span className="inline-flex items-center gap-2 px-4 whitespace-nowrap">
      <span className="text-[var(--foreground)] font-medium text-xs">{symbol}</span>
      <span className="text-xs font-mono">{data ? formatUsd(data.price) : '---'}</span>
      <span
        className={`text-xs font-mono ${isUp ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
      >
        {data ? formatPct(change) : '---'}
      </span>
    </span>
  );
}

export function TickerBar() {
  return (
    <div className="sticky top-0 z-50 bg-[var(--background-secondary)] border-b border-[var(--border)] overflow-hidden h-8 flex items-center">
      <div className="ticker-scroll flex">
        {/* Duplicate for seamless loop */}
        {[...SYMBOLS, ...SYMBOLS].map((sym, i) => (
          <TickerItem key={`${sym}-${i}`} symbol={sym} />
        ))}
      </div>
    </div>
  );
}
