'use client';

import { formatUsd, formatPct, formatCompact } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';

interface MarketData {
  symbol?: string;
  name?: string;
  price?: number;
  priceUsd?: string;
  priceChange24h?: number | null;
  volume24h?: number | null;
  marketCap?: number | null;
  liquidity?: number | null;
}

export function MarketDataCard({ result }: { result: unknown }) {
  const data = result as MarketData;
  if (!data || typeof data !== 'object') return null;

  const price = data.price ?? (data.priceUsd ? parseFloat(data.priceUsd) : 0);
  const change = data.priceChange24h ?? 0;
  const isUp = change >= 0;

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <CryptoIcon symbol={data.symbol ?? data.name ?? ''} size={18} />
          <span className="text-xs font-bold text-[var(--foreground)]">
            {data.symbol ?? data.name ?? 'Token'}
          </span>
          {data.name && data.symbol && (
            <span className="text-[10px] text-[var(--muted)]">{data.name}</span>
          )}
        </div>
        <span
          className={`text-xs font-mono ${isUp ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
        >
          {formatPct(change)}
        </span>
      </div>
      <div className="text-lg font-bold font-mono mb-2">{formatUsd(price)}</div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--muted)]">
        {data.volume24h != null && (
          <div>
            <span className="block">Volume 24h</span>
            <span className="text-[var(--foreground)] font-mono">
              {formatCompact(data.volume24h)}
            </span>
          </div>
        )}
        {data.marketCap != null && (
          <div>
            <span className="block">Market Cap</span>
            <span className="text-[var(--foreground)] font-mono">
              {formatCompact(data.marketCap)}
            </span>
          </div>
        )}
        {data.liquidity != null && (
          <div>
            <span className="block">Liquidity</span>
            <span className="text-[var(--foreground)] font-mono">
              {formatCompact(data.liquidity)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
