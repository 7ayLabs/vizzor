'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { MarketPrice, MLHealth } from '@/lib/types';

const SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
  'ADA',
  'DOGE',
  'AVAX',
  'DOT',
  'MATIC',
  'LINK',
  'UNI',
  'ATOM',
  'LTC',
  'FIL',
  'APT',
  'NEAR',
  'ARB',
  'OP',
  'IMX',
  'INJ',
  'SEI',
  'SUI',
  'TIA',
  'AAVE',
  'MKR',
  'RENDER',
  'FET',
  'GRT',
  'STX',
];

function TickerItem({ symbol }: { symbol: string }) {
  const { data } = useApi<MarketPrice>(`/v1/market/price/${symbol}`, { refreshInterval: 15000 });
  const change = data?.priceChange24h ?? 0;
  const isUp = change >= 0;

  return (
    <span className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-4 whitespace-nowrap">
      <CryptoIcon symbol={symbol} size={14} className="opacity-90" />
      <span className="text-[var(--foreground)] font-medium text-[10px] sm:text-xs">{symbol}</span>
      <span className="text-[10px] sm:text-xs font-mono">
        {data ? formatUsd(data.price) : '---'}
      </span>
      <span
        className={`text-[10px] sm:text-xs font-mono ${isUp ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
      >
        {data ? formatPct(change) : '---'}
      </span>
    </span>
  );
}

function HealthDots() {
  const { data: health } = useApi<{ status: string }>('/health');
  const { data: ml } = useApi<MLHealth>('/v1/market/ml-health');
  const apiOk = !!health;
  const mlOk = ml?.available === true;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-[var(--muted)]">
      <div className="flex items-center gap-1" title={`API: ${apiOk ? 'online' : 'offline'}`}>
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${apiOk ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--danger)]'}`}
        />
        <span className="hidden sm:inline text-[10px] sm:text-xs">API</span>
      </div>
      <div className="flex items-center gap-1" title={`ML: ${mlOk ? 'online' : 'offline'}`}>
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${mlOk ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--muted)]'}`}
        />
        <span className="hidden sm:inline text-[10px] sm:text-xs">ML</span>
      </div>
    </div>
  );
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="h-12 border-b border-[var(--border)] glass-header flex items-center px-2 sm:px-3 gap-2 sm:gap-3 shrink-0 z-10">
      {/* Left: hamburger (mobile) + logo */}
      <button
        onClick={onMenuClick}
        className="md:hidden flex items-center justify-center size-10 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] active:bg-[var(--border)] transition-colors touch-target"
        aria-label="Toggle menu"
      >
        <i className="fa-solid fa-bars text-sm" />
      </button>
      <span className="text-sm font-bold text-[var(--primary)] glow-cyan md:hidden">
        <i className="fa-solid fa-diamond text-xs mr-1" />
        vizzor
      </span>

      {/* Center: ticker */}
      <div className="flex-1 overflow-hidden">
        <div className="ticker-scroll flex">
          {[...SYMBOLS, ...SYMBOLS].map((sym, i) => (
            <TickerItem key={`${sym}-${i}`} symbol={sym} />
          ))}
        </div>
      </div>

      {/* Right: health + theme */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <HealthDots />
        <ThemeToggle />
      </div>
    </header>
  );
}
