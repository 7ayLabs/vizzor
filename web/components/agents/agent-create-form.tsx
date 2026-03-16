'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface AgentCreateFormProps {
  onCreated: () => void;
}

const STRATEGIES = [
  { value: 'momentum', label: 'Momentum', desc: 'Follows price momentum and breakouts' },
  { value: 'trend-following', label: 'Trend Following', desc: 'Rides sustained directional moves' },
  { value: 'ml-adaptive', label: 'ML Adaptive', desc: 'Uses ML models for signal generation' },
];

export function AgentCreateForm({ onCreated }: AgentCreateFormProps) {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('momentum');
  const [pairs, setPairs] = useState('BTC,ETH');
  const [error, setError] = useState('');

  const selectedStrategy = STRATEGIES.find((s) => s.value === strategy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/v1/agents', {
        method: 'POST',
        body: JSON.stringify({
          name,
          strategy,
          pairs: pairs.split(',').map((p) => p.trim()),
          interval: 60,
        }),
      });
      setName('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-4"
    >
      <h3 className="text-xs font-medium text-white/60 mb-3 uppercase tracking-wider">
        Deploy New Agent
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Agent name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/[0.2]"
        />
        <div>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/[0.2]"
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {selectedStrategy && (
            <p className="text-[10px] text-[#6b6b6b] mt-1">{selectedStrategy.desc}</p>
          )}
        </div>
        <input
          type="text"
          placeholder="Pairs (BTC,ETH)"
          value={pairs}
          onChange={(e) => setPairs(e.target.value)}
          className="bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/[0.2]"
        />
        <button
          type="submit"
          className="bg-white/[0.1] text-white rounded-lg px-4 py-2 text-xs font-medium hover:bg-white/[0.15] transition-colors"
        >
          Deploy
        </button>
      </div>
      {error && <p className="text-[var(--danger)] text-xs mt-2">{error}</p>}
    </form>
  );
}
