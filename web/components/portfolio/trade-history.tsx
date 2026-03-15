'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';

interface Trade {
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  closedAt: string;
}

export function TradeHistory() {
  const { data } = useApi<{ trades: Trade[] }>('/v1/portfolio/default/trades');
  const [filter, setFilter] = useState('all');

  const trades = data?.trades ?? [];
  const symbols = [...new Set(trades.map((t) => t.symbol))];
  const filtered = filter === 'all' ? trades : trades.filter((t) => t.symbol === filter);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
          Trade History
        </h3>
        {symbols.length > 1 && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-[10px]"
          >
            <option value="all">All</option>
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>
      {filtered.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--muted)] text-left">
              <th className="pb-2">Symbol</th>
              <th className="pb-2">Side</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">Exit</th>
              <th className="pb-2">PnL</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t, i) => (
              <tr
                key={i}
                className={`border-t border-[var(--border)] hover:bg-[var(--card-hover)] ${i % 2 === 0 ? '' : 'bg-[var(--background-secondary)]'}`}
              >
                <td className="py-2 font-mono font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <CryptoIcon symbol={t.symbol} size={14} />
                    {t.symbol}
                  </span>
                </td>
                <td className="py-2">
                  <span
                    className={t.side === 'long' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}
                  >
                    {t.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 font-mono">{formatUsd(t.entryPrice)}</td>
                <td className="py-2 font-mono">{formatUsd(t.exitPrice)}</td>
                <td
                  className={`py-2 font-mono ${t.pnl >= 0 ? 'text-[var(--success)] glow-green' : 'text-[var(--danger)] glow-red'}`}
                >
                  {formatUsd(t.pnl)} ({formatPct(t.pnlPct)})
                </td>
                <td className="py-2 text-[var(--muted)]">
                  {new Date(t.closedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-[var(--muted)]">No trades yet</p>
      )}
    </div>
  );
}
