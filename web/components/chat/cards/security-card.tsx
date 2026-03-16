'use client';

import { riskLevelColor } from '@/lib/utils';

interface SecurityData {
  riskLevel?: string;
  riskScore?: number;
  isHoneypot?: boolean;
  isMintable?: boolean;
  ownerCanMint?: boolean;
  ownerCanPause?: boolean;
  buyTax?: number;
  sellTax?: number;
  hasLiquidityLock?: boolean;
  holderCount?: number;
  details?: { check: string; passed: boolean; severity: string }[];
}

export function SecurityCard({ result }: { result: unknown }) {
  const data = result as SecurityData;
  if (!data || typeof data !== 'object') return null;

  const riskLevel =
    data.riskLevel ??
    (data.riskScore != null
      ? data.riskScore > 70
        ? 'danger'
        : data.riskScore > 40
          ? 'warning'
          : 'safe'
      : 'unknown');
  const color = riskLevelColor(riskLevel);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold">Security Check</span>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full`}
          style={{ color: `var(${color})`, background: `var(${color})15` }}
        >
          {riskLevel.toUpperCase()}
        </span>
      </div>
      {data.riskScore != null && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-[var(--muted)] mb-1">
            <span>Risk Score</span>
            <span className="font-mono">{data.riskScore}/100</span>
          </div>
          <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${data.riskScore}%`, background: `var(${color})` }}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
        {data.isHoneypot != null && (
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${data.isHoneypot ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`}
            />
            <span className="text-[var(--muted)]">Honeypot</span>
          </div>
        )}
        {(data.isMintable ?? data.ownerCanMint) != null && (
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${(data.isMintable ?? data.ownerCanMint) ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`}
            />
            <span className="text-[var(--muted)]">Mintable</span>
          </div>
        )}
        {data.buyTax != null && (
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${data.buyTax > 10 ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`}
            />
            <span className="text-[var(--muted)]">Buy Tax {data.buyTax}%</span>
          </div>
        )}
        {data.sellTax != null && (
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${data.sellTax > 10 ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'}`}
            />
            <span className="text-[var(--muted)]">Sell Tax {data.sellTax}%</span>
          </div>
        )}
        {data.hasLiquidityLock != null && (
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${data.hasLiquidityLock ? 'bg-[var(--success)]' : 'bg-[var(--warning)]'}`}
            />
            <span className="text-[var(--muted)]">LP Lock</span>
          </div>
        )}
        {data.holderCount != null && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />
            <span className="text-[var(--muted)]">{data.holderCount} holders</span>
          </div>
        )}
      </div>
    </div>
  );
}
