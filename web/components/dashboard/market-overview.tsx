'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct, formatCompact } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { MarketPrice, FearGreedData } from '@/lib/types';

const FG_ZONES = [
  { max: 20, label: 'Extreme Fear', color: '#ef4444' },
  { max: 40, label: 'Fear', color: '#f97316' },
  { max: 60, label: 'Neutral', color: '#f59e0b' },
  { max: 80, label: 'Greed', color: '#84cc16' },
  { max: 100, label: 'Extreme Greed', color: '#10b981' },
];

function getFGStyle(value: number) {
  for (const z of FG_ZONES) if (value <= z.max) return z;
  return FG_ZONES[4];
}

export function MarketOverview() {
  const { data: btc } = useApi<MarketPrice>('/v1/market/price/BTC');
  const { data: fg } = useApi<FearGreedData>('/v1/market/fear-greed');

  const fgValue = fg?.current?.value ?? 50;
  const fgStyle = getFGStyle(fgValue);

  return (
    <div className="dash-card bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 sm:p-4 animate-fade-up stagger-1">
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-chart-line text-xs text-[var(--primary)]" />
        <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
          Market Stats
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {/* BTC Price */}
        <div>
          <p className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <CryptoIcon symbol="BTC" size={12} />
            BTC Price
          </p>
          <p className="text-sm font-mono font-bold">
            {btc?.price != null ? formatUsd(btc.price) : '---'}
          </p>
        </div>

        {/* 24h Change */}
        <div>
          <p className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <i className="fa-solid fa-arrow-right-arrow-left text-[8px]" />
            24h Change
          </p>
          <p
            className="text-sm font-mono font-bold"
            style={{
              color:
                btc?.priceChange24h != null
                  ? btc.priceChange24h >= 0
                    ? 'var(--success)'
                    : 'var(--danger)'
                  : undefined,
            }}
          >
            {btc?.priceChange24h != null ? formatPct(btc.priceChange24h) : '---'}
          </p>
        </div>

        {/* Volume */}
        <div>
          <p className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <i className="fa-solid fa-chart-bar text-[8px]" />
            24h Volume
          </p>
          <p className="text-sm font-mono font-bold">
            {btc?.volume24h != null ? `$${formatCompact(btc.volume24h)}` : '---'}
          </p>
        </div>

        {/* Market Cap */}
        <div>
          <p className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <i className="fa-solid fa-coins text-[8px]" />
            Market Cap
          </p>
          <p className="text-sm font-mono font-bold">
            {btc?.marketCap != null ? `$${formatCompact(btc.marketCap)}` : '---'}
          </p>
        </div>
      </div>

      {/* Fear & Greed bar */}
      <div className="mt-3 pt-3 border-t border-[var(--border)]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <i className="fa-solid fa-gauge text-[8px]" />
            Fear & Greed
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold" style={{ color: fgStyle.color }}>
              {fg ? fgValue : '---'}
            </span>
            <span className="text-[10px]" style={{ color: fgStyle.color }}>
              {fg ? fgStyle.label : ''}
            </span>
          </div>
        </div>
        <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-bar-fill"
            style={{ width: `${fgValue}%`, background: fgStyle.color }}
          />
        </div>
      </div>
    </div>
  );
}
