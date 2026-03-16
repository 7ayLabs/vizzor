'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { MarketPrice } from '@/lib/types';

export function MiniPrice({ symbol }: { symbol: string }) {
  const { data } = useApi<MarketPrice>(`/v1/market/price/${symbol}`);
  const change = data?.priceChange24h ?? 0;
  const isUp = change >= 0;

  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-[var(--text-muted)] flex items-center gap-1">
        <CryptoIcon symbol={symbol} size={12} />
        {symbol}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-white">{data ? formatUsd(data.price) : '---'}</span>
        <span className={`font-mono ${isUp ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
          {data ? formatPct(change) : ''}
        </span>
      </div>
    </div>
  );
}
