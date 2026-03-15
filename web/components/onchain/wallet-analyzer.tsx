'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { riskLevelColor } from '@/lib/utils';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import type { WalletAnalysis } from '@/lib/types';

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

function formatBalance(raw: string): string {
  const wei = BigInt(raw || '0');
  const eth = Number(wei) / 1e18;
  return eth.toFixed(4);
}

export function WalletAnalyzer() {
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [result, setResult] = useState<WalletAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch<WalletAnalysis>('/v1/security/wallet', {
        method: 'POST',
        body: JSON.stringify({ address, chain }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const chainLabel = CHAINS.find((c) => c.value === chain)?.label ?? chain.toUpperCase();

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-xs font-medium text-[var(--muted)] mb-3 uppercase tracking-wider">
        Wallet Analyzer
      </h3>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Wallet address"
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
        <div className="space-y-2 pt-3 border-t border-[var(--border)]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[var(--muted)] uppercase">Balance</p>
              <p className="text-sm font-mono font-bold">
                {formatBalance(result.balance)} {chainLabel}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--muted)] uppercase">Transactions</p>
              <p className="text-sm font-mono font-bold">
                {result.transactionCount?.toLocaleString() ?? '---'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--muted)] uppercase">Risk Level</p>
              <p
                className="text-sm font-bold uppercase"
                style={{ color: riskLevelColor(result.riskLevel) }}
              >
                {result.riskLevel}
              </p>
            </div>
          </div>

          {result.patterns && result.patterns.length > 0 && (
            <div className="border-t border-[var(--border)] pt-2">
              <p className="text-[10px] text-[var(--muted)] uppercase mb-1">Patterns</p>
              <div className="space-y-1">
                {result.patterns.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span
                      className={
                        p.severity === 'danger'
                          ? 'text-[var(--danger)]'
                          : p.severity === 'warning'
                            ? 'text-[var(--warning)]'
                            : 'text-[var(--muted)]'
                      }
                    >
                      {p.severity === 'danger'
                        ? '\u2717'
                        : p.severity === 'warning'
                          ? '\u26A0'
                          : '\u2139'}
                    </span>
                    <span className="text-[var(--foreground)]">{p.type}</span>
                    <span className="text-[var(--muted)] text-[10px] ml-auto truncate max-w-[200px]">
                      {p.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.tokenBalances && result.tokenBalances.length > 0 && (
            <div className="border-t border-[var(--border)] pt-2">
              <p className="text-[10px] text-[var(--muted)] uppercase mb-1">Token Balances</p>
              <div className="space-y-0.5">
                {result.tokenBalances.slice(0, 10).map((tb) => (
                  <div key={tb.address} className="flex justify-between text-xs">
                    <span className="font-medium inline-flex items-center gap-1">
                      <CryptoIcon symbol={tb.symbol} size={12} />
                      {tb.symbol}
                    </span>
                    <span className="font-mono text-[var(--muted)]">
                      {formatBalance(tb.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
