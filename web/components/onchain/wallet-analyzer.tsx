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
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
      <h3 className="text-xs font-medium text-[#6b6b6b] mb-3 uppercase tracking-wider">
        Wallet Analyzer
      </h3>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Wallet address"
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
        <div className="space-y-2 pt-3 border-t border-white/[0.08]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Balance</p>
              <p className="text-sm font-mono font-bold text-white">
                {formatBalance(result.balance)} {chainLabel}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Transactions</p>
              <p className="text-sm font-mono font-bold text-white">
                {result.transactionCount?.toLocaleString() ?? '---'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[#6b6b6b] uppercase">Risk Level</p>
              <p
                className="text-sm font-bold uppercase"
                style={{ color: riskLevelColor(result.riskLevel) }}
              >
                {result.riskLevel}
              </p>
            </div>
          </div>

          {result.patterns && result.patterns.length > 0 && (
            <div className="border-t border-white/[0.08] pt-2">
              <p className="text-[10px] text-[#6b6b6b] uppercase mb-1">Patterns</p>
              <div className="space-y-1">
                {result.patterns.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span
                      className={
                        p.severity === 'danger'
                          ? 'text-[var(--danger)]'
                          : p.severity === 'warning'
                            ? 'text-[#a1a1a1]'
                            : 'text-[#6b6b6b]'
                      }
                    >
                      {p.severity === 'danger'
                        ? '\u2717'
                        : p.severity === 'warning'
                          ? '\u26A0'
                          : '\u2139'}
                    </span>
                    <span className="text-white">{p.type}</span>
                    <span className="text-[#6b6b6b] text-[10px] ml-auto truncate max-w-[200px]">
                      {p.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.tokenBalances && result.tokenBalances.length > 0 && (
            <div className="border-t border-white/[0.08] pt-2">
              <p className="text-[10px] text-[#6b6b6b] uppercase mb-1">Token Balances</p>
              <div className="space-y-0.5">
                {result.tokenBalances.slice(0, 10).map((tb) => (
                  <div key={tb.address} className="flex justify-between text-xs">
                    <span className="font-medium inline-flex items-center gap-1 text-white">
                      <CryptoIcon symbol={tb.symbol} size={12} />
                      {tb.symbol}
                    </span>
                    <span className="font-mono text-[#6b6b6b]">{formatBalance(tb.balance)}</span>
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
