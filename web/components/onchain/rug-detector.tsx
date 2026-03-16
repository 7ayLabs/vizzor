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
  if (score >= 40) return '#a1a1a1';
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
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
      <h3 className="text-xs font-medium text-[#6b6b6b] mb-3 uppercase tracking-wider">
        Rug Pull Detector
      </h3>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Contract address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/[0.2]"
        />
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white"
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
          className="bg-white/[0.1] text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-white/[0.15] disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : 'SCAN'}
        </button>
      </div>

      {error && <p className="text-xs text-[var(--danger)] mb-2">{error}</p>}

      {result && (
        <div className="space-y-3 pt-3 border-t border-white/[0.08]">
          {/* Score */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Risk Score</p>
              <span
                className="text-2xl font-mono font-bold"
                style={{ color: scoreColor(result.riskScore) }}
              >
                {result.riskScore}
              </span>
              <span className="text-xs text-[#6b6b6b]">/100</span>
            </div>
            <span
              className="text-xs px-2 py-0.5 rounded-lg font-bold uppercase"
              style={{
                color: scoreColor(result.riskScore),
                background: `color-mix(in srgb, ${scoreColor(result.riskScore)} 15%, transparent)`,
              }}
            >
              {scoreLabel(result.riskScore)}
            </span>
          </div>

          {/* Score bar */}
          <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
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
              <span className="text-white">Honeypot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={result.hasLiquidityLock ? 'text-[var(--success)]' : 'text-[#a1a1a1]'}
              >
                {result.hasLiquidityLock ? '\u2713' : '\u2717'}
              </span>
              <span className="text-white">Liquidity Lock</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={result.ownerCanMint ? 'text-[#a1a1a1]' : 'text-[var(--success)]'}>
                {result.ownerCanMint ? '\u2717' : '\u2713'}
              </span>
              <span className="text-white">Owner Mint</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={result.highSellTax ? 'text-[var(--danger)]' : 'text-[var(--success)]'}
              >
                {result.highSellTax ? '\u2717' : '\u2713'}
              </span>
              <span className="text-white">Sell Tax</span>
            </div>
          </div>

          {/* Detailed checks */}
          {result.details && result.details.length > 0 && (
            <div className="space-y-1 border-t border-white/[0.08] pt-2">
              {result.details.map((d) => (
                <div key={d.check} className="flex items-center gap-2 text-xs">
                  <span
                    className={
                      d.passed
                        ? 'text-[var(--success)]'
                        : d.severity === 'critical'
                          ? 'text-[var(--danger)]'
                          : 'text-[#a1a1a1]'
                    }
                  >
                    {d.passed ? '\u2713' : '\u2717'}
                  </span>
                  <span className="text-white">{d.check}</span>
                  <span className="text-[#6b6b6b] text-[10px] ml-auto truncate max-w-[200px]">
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
