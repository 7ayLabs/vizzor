'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { RugIndicators } from '@/lib/types';

const CHAINS = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'bsc', label: 'BSC' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'optimism', label: 'Optimism' },
  { value: 'base', label: 'Base' },
  { value: 'avalanche', label: 'Avalanche' },
  { value: 'solana', label: 'Solana' },
  { value: 'sui', label: 'Sui' },
  { value: 'aptos', label: 'Aptos' },
  { value: 'ton', label: 'TON' },
];

function scoreColor(score: number): string {
  if (score >= 70) return 'var(--danger)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--success)';
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'HIGH RISK';
  if (score >= 40) return 'MEDIUM';
  return 'LOW RISK';
}

export function RugDetector() {
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [result, setResult] = useState<RugIndicators | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch<RugIndicators>('/v1/security/rug-check', {
        method: 'POST',
        body: JSON.stringify({ address, chain }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-xs font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Rug Pull Detector
      </h3>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Contract address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[var(--primary)]"
        />
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1.5 text-xs"
        >
          {CHAINS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleScan}
          disabled={loading || !address.trim()}
          className="bg-[var(--primary)] text-white rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? '...' : 'SCAN'}
        </button>
      </div>

      {error && <p className="text-xs text-[var(--danger)] mb-2">{error}</p>}

      {result && (
        <div className="space-y-3 pt-3 border-t border-[var(--border)]">
          {/* Score */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-[var(--muted)] uppercase">Risk Score</p>
              <span
                className="text-2xl font-mono font-bold"
                style={{ color: scoreColor(result.riskScore) }}
              >
                {result.riskScore}
              </span>
              <span className="text-xs text-[var(--muted)]">/100</span>
            </div>
            <span
              className="text-xs px-2 py-0.5 rounded font-bold uppercase"
              style={{
                color: scoreColor(result.riskScore),
                background: `color-mix(in srgb, ${scoreColor(result.riskScore)} 15%, transparent)`,
              }}
            >
              {scoreLabel(result.riskScore)}
            </span>
          </div>

          {/* Score bar */}
          <div className="w-full h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${result.riskScore}%`,
                background: scoreColor(result.riskScore),
              }}
            />
          </div>

          {/* Quick checks */}
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className={result.isHoneypot ? 'text-[var(--danger)]' : 'text-[var(--success)]'}
              >
                {result.isHoneypot ? '\u2717' : '\u2713'}
              </span>
              <span>Honeypot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={
                  result.hasLiquidityLock ? 'text-[var(--success)]' : 'text-[var(--warning)]'
                }
              >
                {result.hasLiquidityLock ? '\u2713' : '\u2717'}
              </span>
              <span>Liquidity Lock</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={result.ownerCanMint ? 'text-[var(--warning)]' : 'text-[var(--success)]'}
              >
                {result.ownerCanMint ? '\u2717' : '\u2713'}
              </span>
              <span>Owner Mint</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={result.highSellTax ? 'text-[var(--danger)]' : 'text-[var(--success)]'}
              >
                {result.highSellTax ? '\u2717' : '\u2713'}
              </span>
              <span>Sell Tax</span>
            </div>
          </div>

          {/* Detailed checks */}
          {result.details && result.details.length > 0 && (
            <div className="space-y-1 border-t border-[var(--border)] pt-2">
              {result.details.map((d) => (
                <div key={d.check} className="flex items-center gap-2 text-xs">
                  <span
                    className={
                      d.passed
                        ? 'text-[var(--success)]'
                        : d.severity === 'critical'
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--warning)]'
                    }
                  >
                    {d.passed ? '\u2713' : '\u2717'}
                  </span>
                  <span className="text-[var(--foreground)]">{d.check}</span>
                  <span className="text-[var(--muted)] text-[10px] ml-auto truncate max-w-[200px]">
                    {d.description}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
