'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { riskLevelColor } from '@/lib/utils';
import type { TokenSecurity } from '@/lib/types';

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

export function TokenScanner() {
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [result, setResult] = useState<TokenSecurity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch<TokenSecurity>('/v1/security/token', {
        method: 'POST',
        body: JSON.stringify({ address, chain }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4">
      <h3 className="text-xs font-medium text-[#6b6b6b] mb-3 uppercase tracking-wider">
        Token Security Scanner
      </h3>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Contract address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="flex-1 min-w-[200px] bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/[0.2]"
        />
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white"
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
          className="bg-white/[0.1] text-white rounded-lg px-4 py-1.5 text-xs font-medium hover:bg-white/[0.15] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Scanning...' : 'SCAN'}
        </button>
      </div>

      {error && <p className="text-xs text-[var(--danger)] mb-2">{error}</p>}

      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/[0.08]">
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Risk Level</p>
            <p
              className="text-sm font-bold uppercase"
              style={{ color: riskLevelColor(result.riskLevel) }}
            >
              {result.riskLevel}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Honeypot</p>
            <p
              className={`text-sm font-bold ${result.isHoneypot ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}
            >
              {result.isHoneypot ? 'YES' : 'NO'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Mintable</p>
            <p
              className={`text-sm font-bold ${result.isMintable ? 'text-[#a1a1a1]' : 'text-[var(--success)]'}`}
            >
              {result.isMintable ? 'YES' : 'NO'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Buy/Sell Tax</p>
            <p className="text-sm font-mono font-bold text-white">
              {result.buyTax != null ? `${result.buyTax}%` : '---'} /{' '}
              {result.sellTax != null ? `${result.sellTax}%` : '---'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Holders</p>
            <p className="text-sm font-mono text-white">
              {result.holderCount != null ? result.holderCount.toLocaleString() : '---'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Open Source</p>
            <p
              className={`text-sm font-bold ${result.isOpenSource ? 'text-[var(--success)]' : 'text-[#a1a1a1]'}`}
            >
              {result.isOpenSource ? 'YES' : 'NO'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Hidden Owner</p>
            <p
              className={`text-sm font-bold ${result.hiddenOwner ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}
            >
              {result.hiddenOwner ? 'YES' : 'NO'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#6b6b6b] uppercase">Trust List</p>
            <p
              className={`text-sm font-bold ${result.trustList ? 'text-[var(--success)]' : 'text-[#6b6b6b]'}`}
            >
              {result.trustList ? 'YES' : 'NO'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
