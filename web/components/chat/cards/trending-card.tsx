'use client';

import { formatUsd, formatPct, formatCompact } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';

interface TrendingItem {
  symbol: string;
  name: string;
  chain?: string;
  priceUsd?: string;
  price?: number;
  priceChange24h?: number | null;
  volume24h?: number | null;
  rank?: number;
}

export function TrendingCard({ result }: { result: unknown }) {
  // Handle both { trending: [...] } and direct array
  const raw = result as Record<string, unknown>;
  const items: TrendingItem[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.trending)
      ? (raw.trending as TrendingItem[])
      : [];

  if (!items.length) return null;

  return (
    <div className="p-3">
      <div className="text-xs font-bold mb-2">Trending Tokens</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[var(--muted)] border-b border-[var(--border)]">
              <th className="text-left py-1 pr-2">#</th>
              <th className="text-left py-1 pr-2">Token</th>
              <th className="text-right py-1 pr-2">Price</th>
              <th className="text-right py-1 pr-2">24h</th>
              <th className="text-right py-1">Volume</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 10).map((item, i) => {
              const price = item.price ?? (item.priceUsd ? parseFloat(item.priceUsd) : 0);
              const change = item.priceChange24h ?? 0;
              return (
                <tr key={item.symbol + i} className="border-b border-[var(--border)]/50">
                  <td className="py-1 pr-2 text-[var(--muted)]">{item.rank ?? i + 1}</td>
                  <td className="py-1 pr-2">
                    <span className="font-medium text-[var(--foreground)] inline-flex items-center gap-1">
                      <CryptoIcon symbol={item.symbol} size={12} />
                      {item.symbol}
                    </span>
                    {item.chain && <span className="ml-1 text-[var(--muted)]">{item.chain}</span>}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">{formatUsd(price)}</td>
                  <td
                    className={`py-1 pr-2 text-right font-mono ${change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                  >
                    {formatPct(change)}
                  </td>
                  <td className="py-1 text-right font-mono text-[var(--muted)]">
                    {item.volume24h != null ? formatCompact(item.volume24h) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
