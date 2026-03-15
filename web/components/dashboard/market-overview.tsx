'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct, formatCompact } from '@/lib/utils';
import type { MarketPrice, FearGreedData } from '@/lib/types';

export function MarketOverview() {
  const { data: btc } = useApi<MarketPrice>('/v1/market/price/BTC');
  const { data: fg } = useApi<FearGreedData>('/v1/market/fear-greed');

  const price = btc?.price;
  const change = btc?.priceChange24h;
  const volume = btc?.volume24h;
  const mcap = btc?.marketCap;

  const stats = [
    { label: 'BTC Price', value: price != null ? formatUsd(price) : '---', color: undefined },
    {
      label: '24h Change',
      value: change != null ? formatPct(change) : '---',
      color: change != null ? (change >= 0 ? 'var(--success)' : 'var(--danger)') : undefined,
    },
    {
      label: '24h Volume',
      value: volume != null ? `$${formatCompact(volume)}` : '---',
      color: undefined,
    },
    {
      label: 'Market Cap',
      value: mcap != null ? `$${formatCompact(mcap)}` : '---',
      color: undefined,
    },
    {
      label: 'Fear & Greed',
      value: fg?.current?.value != null ? String(fg.current.value) : '---',
      color: 'var(--primary)',
    },
    { label: 'Sentiment', value: fg?.current?.classification ?? '---', color: undefined },
  ];

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-xs font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Market Stats
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[10px] text-[var(--muted)] uppercase">{s.label}</p>
            <p
              className="text-sm font-mono font-bold"
              style={s.color ? { color: s.color } : undefined}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
