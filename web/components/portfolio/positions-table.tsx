'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';

interface Position {
  symbol: string;
  side: string;
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
}

type SortKey = 'symbol' | 'pnl' | 'pnlPct' | 'size';

export function PositionsTable() {
  const { data } = useApi<{ positions: Position[] }>('/v1/portfolio/default');
  const [sortBy, setSortBy] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  const positions = [...(data?.positions ?? [])].sort((a, b) => {
    const m = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol) * m;
    return (a[sortBy] - b[sortBy]) * m;
  });

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="pb-2 cursor-pointer hover:text-white select-none"
      onClick={() => handleSort(field)}
    >
      {label} {sortBy === field ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
    </th>
  );

  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
      <h3 className="text-xs font-medium text-[#6b6b6b] mb-3 uppercase tracking-wider">
        Open Positions
      </h3>
      {positions.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#6b6b6b] text-left">
              <SortHeader label="Symbol" field="symbol" />
              <th className="pb-2">Side</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">Current</th>
              <SortHeader label="Size" field="size" />
              <SortHeader label="PnL" field="pnl" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => (
              <tr
                key={p.symbol}
                className={`border-t border-white/[0.06] hover:bg-white/[0.04] ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}
              >
                <td className="py-2 font-mono font-medium text-white">
                  <span className="inline-flex items-center gap-1.5">
                    <CryptoIcon symbol={p.symbol} size={14} />
                    {p.symbol}
                  </span>
                </td>
                <td className="py-2">
                  <span
                    className={p.side === 'long' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}
                  >
                    {p.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 font-mono text-[#a1a1a1]">{formatUsd(p.entryPrice)}</td>
                <td className="py-2 font-mono text-[#a1a1a1]">{formatUsd(p.currentPrice)}</td>
                <td className="py-2 font-mono text-white">{p.size}</td>
                <td
                  className={`py-2 font-mono ${p.pnl >= 0 ? 'text-[var(--success)] glow-green' : 'text-[var(--danger)] glow-red'}`}
                >
                  {formatUsd(p.pnl)} ({formatPct(p.pnlPct)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-[#6b6b6b]">No open positions</p>
      )}
    </div>
  );
}
