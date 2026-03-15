'use client';

import { useApi } from '@/hooks/use-api';
import type { Agent } from '@/lib/types';

const STRATEGY_COLORS: Record<string, string> = {
  momentum: 'var(--accent-blue)',
  'trend-following': 'var(--accent-purple)',
  'ml-adaptive': 'var(--primary)',
};

export function AgentSummary() {
  const { data } = useApi<{ agents: Agent[] }>('/v1/agents');

  const agents = data?.agents ?? [];
  const running = agents.filter((a) => a.status === 'running').length;
  const total = agents.length;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">Agents</h3>
        <span className="text-xs font-mono text-[var(--muted)]">
          <span className="text-[var(--success)]">{running}</span>/{total}
        </span>
      </div>
      <div className="space-y-1.5">
        {agents.length > 0 ? (
          agents.map((agent) => {
            const isRunning = agent.status === 'running';
            return (
              <div key={agent.name} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--success)] pulse-dot" />
                  )}
                  {!isRunning && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-600" />
                  )}
                  <span className={isRunning ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}>
                    {agent.name}
                  </span>
                </div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    color: STRATEGY_COLORS[agent.strategy] ?? 'var(--muted)',
                    background: `color-mix(in srgb, ${STRATEGY_COLORS[agent.strategy] ?? 'var(--muted)'} 15%, transparent)`,
                  }}
                >
                  {agent.strategy}
                </span>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-[var(--muted)]">No agents</p>
        )}
      </div>
    </div>
  );
}
