'use client';

import { useApi } from '@/hooks/use-api';
import { formatCompact } from '@/lib/utils';
import type { DerivativesData } from '@/lib/types';

export function DerivativesPanel({ symbol }: { symbol: string }) {
  const { data } = useApi<DerivativesData>(`/v1/market/derivatives/${symbol}`);

  const fundingRate = data?.fundingRate;
  const fundingColor =
    fundingRate != null
      ? fundingRate > 0
        ? 'var(--success)'
        : fundingRate < 0
          ? 'var(--danger)'
          : 'var(--foreground)'
      : undefined;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-xs font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Derivatives
      </h3>
      {data ? (
        <div className="space-y-2">
          {fundingRate != null && (
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">Funding Rate</span>
              <span className="font-mono font-bold" style={{ color: fundingColor }}>
                {fundingRate > 0 ? '+' : ''}
                {(fundingRate * 100).toFixed(4)}%
              </span>
            </div>
          )}
          {data.markPrice != null && (
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">Mark Price</span>
              <span className="font-mono">${formatCompact(data.markPrice)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-[var(--muted)]">Open Interest</span>
            <span className="font-mono">
              {data.openInterest != null ? `$${formatCompact(data.openInterest)}` : '---'}
            </span>
          </div>
          {data.openInterestNotional != null && (
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">OI Notional</span>
              <span className="font-mono">${formatCompact(data.openInterestNotional)}</span>
            </div>
          )}
          {data.longShortRatio != null && (
            <div className="flex justify-between text-xs">
              <span className="text-[var(--muted)]">Long/Short</span>
              <span className="font-mono">{data.longShortRatio.toFixed(2)}</span>
            </div>
          )}
          {fundingRate == null &&
            data.markPrice == null &&
            data.longShortRatio == null &&
            data.openInterest == null && (
              <p className="text-xs text-[var(--muted)]">Limited derivatives data available</p>
            )}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">Loading...</p>
      )}
    </div>
  );
}
