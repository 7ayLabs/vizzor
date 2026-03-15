'use client';

import { apiFetch } from '@/lib/api';

const STRATEGY_COLORS: Record<string, string> = {
  momentum: 'rgba(255,255,255,0.5)',
  'trend-following': 'rgba(255,255,255,0.45)',
  'ml-adaptive': 'rgba(255,255,255,0.6)',
};

interface AgentCardProps {
  agent: {
    name: string;
    strategy: string;
    pairs: string[];
    status: string;
    cycleCount: number;
  };
  onAction: () => void;
}

export function AgentCard({ agent, onAction }: AgentCardProps) {
  const isRunning = agent.status === 'running';
  const _stratColor = STRATEGY_COLORS[agent.strategy] ?? '#6b6b6b';

  const handleToggle = async () => {
    const action = isRunning ? 'stop' : 'start';
    await apiFetch(`/v1/agents/${agent.name}/${action}`, { method: 'POST' });
    onAction();
  };

  return (
    <div
      className="bg-white/[0.04] backdrop-blur-xl border rounded-xl p-4 transition-all"
      style={{
        borderColor: isRunning ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)',
        boxShadow: isRunning ? '0 0 20px rgba(255, 255, 255, 0.03)' : 'none',
      }}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
          )}
          <h4 className="font-medium text-sm text-white">{agent.name}</h4>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-white/[0.06] text-[#a1a1a1]">
          {agent.strategy}
        </span>
      </div>
      <div className="text-xs text-[#6b6b6b] space-y-1 mb-3">
        <p>Pairs: {agent.pairs.join(', ')}</p>
        <p>
          Cycles: <span className="font-mono text-white">{agent.cycleCount}</span>
        </p>
      </div>
      <button
        onClick={handleToggle}
        className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
          isRunning
            ? 'bg-red-500/10 text-[var(--danger)] hover:bg-red-500/20'
            : 'bg-green-500/10 text-[var(--success)] hover:bg-green-500/20'
        }`}
      >
        {isRunning ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}
