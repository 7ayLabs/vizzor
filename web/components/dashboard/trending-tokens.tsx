'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct, formatCompact } from '@/lib/utils';
import type { TrendingToken } from '@/lib/types';

const CHAIN_COLORS: Record<string, { bg: string; text: string }> = {
  ETH: { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' },
  SOL: { bg: 'rgba(139, 92, 246, 0.2)', text: '#8b5cf6' },
  BSC: { bg: 'rgba(249, 115, 22, 0.2)', text: '#f59e0b' },
  BASE: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
  ARB: { bg: 'rgba(59, 130, 246, 0.2)', text: '#38bdf8' },
};

function ChainBadge({ chain }: { chain: string }) {
  const colors = CHAIN_COLORS[chain.toUpperCase()] ?? {
    bg: 'rgba(100, 116, 139, 0.2)',
    text: '#64748b',
  };
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: colors.bg, color: colors.text }}
    >
      {chain}
    </span>
  );
}

export function TrendingTokens() {
  const { data } = useApi<{ trending: TrendingToken[] }>('/v1/market/trending');
  const tokens = data?.trending?.slice(0, 10) ?? [];

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-xs font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Trending
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--muted)] text-left">
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
                    className="border-t border-[var(--border)] hover:bg-[var(--card-hover)]"
                  >
                    <td className="py-1.5 pr-2 text-[var(--muted)]">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-medium">{t.symbol}</td>
                    <td className="py-1.5 pr-3">
                      <ChainBadge chain={t.chain} />
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {price != null ? formatUsd(price) : '---'}
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right font-mono ${change != null && change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
                    >
                      {change != null ? formatPct(change) : '---'}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {t.volume24h != null ? `$${formatCompact(t.volume24h)}` : '---'}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {t.marketCap != null ? `$${formatCompact(t.marketCap)}` : '---'}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-4 text-center text-[var(--muted)]">
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
