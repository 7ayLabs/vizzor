'use client';

import { useRef, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import { VizzorLogo } from '@/components/ui/vizzor-logo';
import { NotificationPanel } from '@/components/dashboard/notification-panel';
import type { MarketPrice, MLHealth } from '@/lib/types';

// prettier-ignore
const SYMBOLS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC',
  'LINK', 'UNI', 'ATOM', 'LTC', 'FIL', 'APT', 'NEAR', 'ARB', 'OP', 'IMX',
  'INJ', 'SEI', 'SUI', 'TIA', 'AAVE', 'MKR', 'RENDER', 'FET', 'GRT', 'STX',
  'TRX', 'TON', 'SHIB', 'BCH', 'DAI', 'LEO', 'ETC', 'HBAR', 'KAS', 'OKB',
  'CRO', 'ALGO', 'VET', 'FTM', 'RUNE', 'SAND', 'MANA', 'AXS', 'THETA', 'XTZ',
  'EOS', 'FLOW', 'NEO', 'KAVA', 'IOTA', 'ZEC', 'EGLD', 'XEC', 'MINA', 'SNX',
  'CHZ', 'LRC', 'ENJ', 'BAT', 'COMP', 'YFI', 'CRV', '1INCH', 'SUSHI', 'CELO',
  'ZIL', 'QTUM', 'ICX', 'ONT', 'ZRX', 'ANKR', 'SKL', 'STORJ', 'KNC', 'BNT',
  'RSR', 'REN', 'CELR', 'DENT', 'HOT', 'SC', 'IOST', 'OMG', 'WAVES', 'DASH',
  'XLM', 'ICP', 'FLR', 'JASMY', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'WLD', 'JUP',
];

const SYMBOLS_QUERY = SYMBOLS.join(',');
const TICKER_SPEED = 80;

function Ticker() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(0);
  const { data } = useApi<{ prices: Record<string, MarketPrice> }>(
    `/v1/market/prices?symbols=${SYMBOLS_QUERY}`,
    { refreshInterval: 15000 },
  );
  const prices = data?.prices;

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const halfWidth = el.scrollWidth / 2;
      if (halfWidth > 0) setDuration(halfWidth / TICKER_SPEED);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex-1 overflow-hidden">
      <div
        ref={trackRef}
        className="flex"
        style={
          duration > 0
            ? {
                animation: `ticker-scroll ${duration}s linear infinite`,
              }
            : undefined
        }
      >
        {[...SYMBOLS, ...SYMBOLS].map((sym, i) => {
          const d = prices?.[sym];
          const change = d?.priceChange24h ?? 0;
          const isUp = change >= 0;
          return (
            <span
              key={`${sym}-${i}`}
              className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-4 whitespace-nowrap"
            >
              <CryptoIcon symbol={sym} size={14} className="opacity-90" />
              <span className="text-white font-medium text-[10px] sm:text-xs">{sym}</span>
              <span className="text-[10px] sm:text-xs font-mono text-[#a1a1a1]">
                {d ? formatUsd(d.price) : '---'}
              </span>
              <span
                className={`text-[10px] sm:text-xs font-mono ${isUp ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
              >
                {d ? formatPct(change) : '---'}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function HealthDots() {
  const { data: health } = useApi<{ status: string }>('/health');
  const { data: ml } = useApi<MLHealth>('/v1/market/ml-health');
  const apiOk = !!health;
  const mlOk = ml?.available === true;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-[#6b6b6b]">
      <div className="flex items-center gap-1" title={`API: ${apiOk ? 'online' : 'offline'}`}>
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${apiOk ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--danger)]'}`}
        />
        <span className="hidden sm:inline text-[10px] sm:text-xs">API</span>
      </div>
      <div className="flex items-center gap-1" title={`ML: ${mlOk ? 'online' : 'offline'}`}>
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${mlOk ? 'bg-[var(--success)] pulse-dot' : 'bg-[#6b6b6b]'}`}
        />
        <span className="hidden sm:inline text-[10px] sm:text-xs">ML</span>
      </div>
    </div>
  );
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="h-12 border-b border-white/[0.06] glass-header flex items-center px-2 sm:px-3 gap-2 sm:gap-3 shrink-0 z-10">
      {/* Left: hamburger (mobile) + logo */}
      <button
        onClick={onMenuClick}
        className="md:hidden flex items-center justify-center size-10 rounded-lg text-[#6b6b6b] hover:text-white active:bg-white/[0.08] transition-colors touch-target"
        aria-label="Toggle menu"
      >
        <i className="fa-solid fa-bars text-sm" />
      </button>
      <span className="text-sm font-bold text-white md:hidden">
        <VizzorLogo size={22} className="inline-block mr-1" />
        vizzor
      </span>

      {/* Center: ticker */}
      <Ticker />

      {/* Right: health + notifications */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <HealthDots />
        <NotificationPanel />
      </div>
    </header>
  );
}
