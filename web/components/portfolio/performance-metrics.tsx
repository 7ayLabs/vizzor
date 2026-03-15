'use client';

import { useApi } from '@/hooks/use-api';
import { formatUsd, formatPct, formatCompact } from '@/lib/utils';

interface Metrics {
  totalValue: number;
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export function PerformanceMetrics() {
  const { data } = useApi<Metrics>('/v1/portfolio/default');

  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
      <h3 className="text-xs font-medium text-[#6b6b6b] mb-3 uppercase tracking-wider">
        Performance
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat
          label="Total Value"
          value={data ? `$${formatCompact(data.totalValue)}` : '---'}
          large
        />
        <Stat
          label="Return"
          value={data ? formatPct(data.totalReturnPct) : '---'}
          color={data && data.totalReturnPct >= 0 ? 'var(--success)' : 'var(--danger)'}
          glow
        />
        <Stat label="Win Rate" value={data ? `${(data.winRate * 100).toFixed(1)}%` : '---'} />
        <Stat label="Sharpe" value={data ? data.sharpeRatio.toFixed(2) : '---'} />
        <Stat
          label="Max DD"
          value={data ? `${data.maxDrawdown.toFixed(1)}%` : '---'}
          color="var(--danger)"
        />
        <Stat
          label="P&L"
          value={data ? formatUsd(data.totalReturn) : '---'}
          color={data && data.totalReturn >= 0 ? 'var(--success)' : 'var(--danger)'}
          glow
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  large,
  glow,
}: {
  label: string;
  value: string;
  color?: string;
  large?: boolean;
  glow?: boolean;
}) {
  const glowClass = glow && color ? (color === 'var(--success)' ? 'glow-green' : 'glow-red') : '';

  return (
    <div>
      <p className="text-[10px] text-[#6b6b6b] uppercase">{label}</p>
      <p
        className={`font-mono font-bold ${large ? 'text-xl' : 'text-sm'} ${glowClass} text-white`}
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
