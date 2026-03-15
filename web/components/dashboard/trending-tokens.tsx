'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct, formatCompact } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { TrendingToken } from '@/lib/types';

const CHAIN_COLORS: Record<string, { bg: string; text: string }> = {
  ETH: { bg: 'rgba(255, 255, 255, 0.08)', text: '#a1a1a1' },
  SOL: { bg: 'rgba(255, 255, 255, 0.08)', text: '#a1a1a1' },
  BSC: { bg: 'rgba(255, 255, 255, 0.08)', text: '#a1a1a1' },
  BASE: { bg: 'rgba(255, 255, 255, 0.08)', text: '#a1a1a1' },
  ARB: { bg: 'rgba(255, 255, 255, 0.08)', text: '#a1a1a1' },
};

function ChainBadge({ chain }: { chain: string }) {
  const colors = CHAIN_COLORS[chain.toUpperCase()] ?? {
    bg: 'rgba(255, 255, 255, 0.06)',
    text: '#6b6b6b',
  };
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded font-medium"
      style={{ background: colors.bg, color: colors.text }}
    >
      <CryptoIcon symbol={chain} size={10} />
      {chain}
    </span>
  );
}

/** Mobile card view for small screens */
function TokenCard({ token, rank }: { token: TrendingToken; rank: number }) {
  const price = token.priceUsd != null ? parseFloat(token.priceUsd) : null;
  const change = token.priceChange24h;

  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-white/[0.06] last:border-0">
      <span className="text-[10px] text-[#6b6b6b] w-4 shrink-0 text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <CryptoIcon symbol={token.symbol} size={14} />
          <span className="text-xs font-medium truncate text-white">{token.symbol}</span>
          <ChainBadge chain={token.chain} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono text-[#a1a1a1]">
            {price != null ? formatUsd(price) : '---'}
          </span>
          {token.volume24h != null && (
            <span className="text-[10px] font-mono text-[#6b6b6b]">
              Vol ${formatCompact(token.volume24h)}
            </span>
          )}
        </div>
      </div>
      <span
        className={`text-[11px] font-mono shrink-0 ${change != null && change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
      >
        {change != null ? formatPct(change) : '---'}
      </span>
    </div>
  );
}

export function TrendingTokens() {
  const { data } = useApi<{ trending: TrendingToken[] }>('/v1/market/trending');
  const tokens = data?.trending?.slice(0, 10) ?? [];

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-3 sm:p-4 animate-fade-up stagger-5">
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <i className="fa-solid fa-fire text-xs text-white/40" />
        <h3 className="text-xs font-medium text-[#6b6b6b] uppercase tracking-wider">Trending</h3>
      </div>

      {/* Mobile: card layout */}
      <div className="sm:hidden">
        {tokens.length > 0 ? (
          tokens.map((t, i) => <TokenCard key={`${t.symbol}-${i}`} token={t} rank={i + 1} />)
        ) : (
          <p className="text-xs text-[#6b6b6b] text-center py-4">Loading trending tokens...</p>
        )}
      </div>

      {/* Desktop: table layout */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#6b6b6b] text-left">
              <th className="pb-2 pr-2">#</th>
              <th className="pb-2 pr-3">Token</th>
              <th className="pb-2 pr-3">Chain</th>
              <th className="pb-2 pr-3 text-right">Price</th>
              <th className="pb-2 pr-3 text-right">24h</th>
              <th className="pb-2 pr-3 text-right">Volume</th>
              <th className="pb-2 text-right">MCap</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length > 0 ? (
              tokens.map((t, i) => {
                const price = t.priceUsd != null ? parseFloat(t.priceUsd) : null;
                const change = t.priceChange24h;
                return (
                  <tr
                    key={`${t.symbol}-${i}`}
                    className="border-t border-white/[0.06] hover:bg-white/[0.04]"
                  >
                    <td className="py-1.5 pr-2 text-[#6b6b6b]">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-medium text-white">
                      <span className="inline-flex items-center gap-1.5">
                        <CryptoIcon symbol={t.symbol} size={14} />
                        {t.symbol}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <ChainBadge chain={t.chain} />
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[#a1a1a1]">
                      {price != null ? formatUsd(price) : '---'}
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right font-mono ${change != null && change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                    >
                      {change != null ? formatPct(change) : '---'}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[#a1a1a1]">
                      {t.volume24h != null ? `$${formatCompact(t.volume24h)}` : '---'}
                    </td>
                    <td className="py-1.5 text-right font-mono text-[#a1a1a1]">
                      {t.marketCap != null ? `$${formatCompact(t.marketCap)}` : '---'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-4 text-center text-[#6b6b6b]">
                  Loading trending tokens...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
