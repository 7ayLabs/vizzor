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

/** Safely parse price — CoinGecko trending API sometimes returns placeholder strings. */
function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  return !isNaN(n) && n > 0 ? n : null;
}

/** Safely parse change percentage — guard against NaN. */
function parseChange(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN;
  return !isNaN(n) ? n : null;
}

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
  const price = parsePrice(token.priceUsd);
  const change = parseChange(token.priceChange24h);

  return (
    <div className="flex items-center gap-2.5 py-2.5 border-b border-white/[0.06] last:border-0">
      <span className="text-[10px] text-[#6b6b6b] w-4 shrink-0 text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <CryptoIcon symbol={token.symbol} size={14} />
          <span className="text-sm font-medium truncate text-white">{token.symbol}</span>
          <ChainBadge chain={token.chain} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {price != null ? (
            <span className="text-xs font-mono text-[#a1a1a1]">{formatUsd(price)}</span>
          ) : (
            <span className="text-xs font-mono text-[var(--text-muted)]">N/A</span>
          )}
          {token.volume24h != null && (
            <span className="text-[10px] font-mono text-[#6b6b6b]">
              Vol ${formatCompact(token.volume24h)}
            </span>
          )}
        </div>
      </div>
      {change != null ? (
        <span
          className={`text-xs font-mono shrink-0 ${change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}
        >
          {formatPct(change)}
        </span>
      ) : (
        <span className="text-xs font-mono shrink-0 text-[var(--text-muted)]">---</span>
      )}
    </div>
  );
}

export function TrendingTokens() {
  const { data } = useApi<{ trending: TrendingToken[] }>('/v1/market/trending');
  const tokens = data?.trending?.slice(0, 10) ?? [];

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl animate-fade-up stagger-5">
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        <i className="fa-solid fa-fire text-xs text-white/40" />
        <h3 className="dash-title">Trending</h3>
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
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#6b6b6b] text-left text-xs">
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
                const price = parsePrice(t.priceUsd);
                const change = parseChange(t.priceChange24h);
                return (
                  <tr
                    key={`${t.symbol}-${i}`}
                    className="border-t border-white/[0.06] hover:bg-white/[0.04]"
                  >
                    <td className="py-1.5 pr-2 text-xs text-[#6b6b6b]">{i + 1}</td>
                    <td className="py-1.5 pr-3 text-sm font-medium text-white">
                      <span className="inline-flex items-center gap-1.5">
                        <CryptoIcon symbol={t.symbol} size={14} />
                        {t.symbol}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <ChainBadge chain={t.chain} />
                    </td>
                    <td className="py-1.5 pr-3 text-right text-sm font-mono">
                      {price != null ? (
                        <span className="text-[#a1a1a1]">{formatUsd(price)}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">N/A</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-sm font-mono">
                      {change != null ? (
                        <span
                          className={change >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}
                        >
                          {formatPct(change)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">---</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-sm font-mono text-[#a1a1a1]">
                      {t.volume24h != null ? `$${formatCompact(t.volume24h)}` : '---'}
                    </td>
                    <td className="py-1.5 text-right text-sm font-mono text-[#a1a1a1]">
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
