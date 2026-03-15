'use client';

import { apiFetch } from '@/lib/api';

const STRATEGY_COLORS: Record<string, string> = {
  momentum: 'var(--accent-blue)',
  'trend-following': 'var(--accent-purple)',
  'ml-adaptive': 'var(--primary)',
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
  const stratColor = STRATEGY_COLORS[agent.strategy] ?? 'var(--muted)';

  const handleToggle = async () => {
    const action = isRunning ? 'stop' : 'start';
    await apiFetch(`/v1/agents/${agent.name}/${action}`, { method: 'POST' });
    onAction();
  };

  return (
    <div
      className="bg-[var(--card)] border rounded-lg p-4 transition-all"
      style={{
        borderColor: isRunning ? 'rgba(6, 182, 212, 0.3)' : 'var(--border)',
        boxShadow: isRunning ? '0 0 12px rgba(6, 182, 212, 0.1)' : 'none',
      }}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
          )}
          <h4 className="font-medium text-sm">{agent.name}</h4>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded font-medium"
          style={{
            color: stratColor,
            background: `color-mix(in srgb, ${stratColor} 15%, transparent)`,
          }}
        >
          {agent.strategy}
        </span>
      </div>
      <div className="text-xs text-[var(--muted)] space-y-1 mb-3">
        <p>Pairs: {agent.pairs.join(', ')}</p>
        <p>
          Cycles: <span className="font-mono">{agent.cycleCount}</span>
        </p>
      </div>
      <button
        onClick={handleToggle}
        className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
          isRunning
            ? 'bg-[var(--danger-bg)] text-[var(--danger)] hover:bg-red-900/30'
            : 'bg-[var(--success-bg)] text-[var(--success)] hover:bg-green-900/30'
        }`}
      >
        {isRunning ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}
