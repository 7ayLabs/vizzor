'use client';

import { useApi } from '@/hooks/use-api';
import type { Agent } from '@/lib/types';

const STRATEGY_ICONS: Record<string, { icon: string; color: string }> = {
  momentum: { icon: 'fa-solid fa-bolt', color: 'var(--accent-blue)' },
  'trend-following': { icon: 'fa-solid fa-arrow-trend-up', color: 'var(--accent-purple)' },
  'ml-adaptive': { icon: 'fa-solid fa-microchip', color: 'var(--primary)' },
};

export function AgentSummary() {
  const { data } = useApi<{ agents: Agent[] }>('/v1/agents');

  const agents = data?.agents ?? [];
  const running = agents.filter((a) => a.status === 'running').length;
  const total = agents.length;

  return (
    <div className="dash-card bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 sm:p-4 animate-fade-up stagger-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-robot text-xs text-[var(--accent-orange)]" />
          <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
            Agent Swarm
          </h3>
        </div>
        <span className="text-xs font-mono text-[var(--muted)]">
          <span className="text-[var(--success)]">{running}</span>/{total}
        </span>
      </div>
      <div className="space-y-1.5">
        {agents.length > 0 ? (
          agents.map((agent, i) => {
            const isRunning = agent.status === 'running';
            const strat = STRATEGY_ICONS[agent.strategy];
            return (
              <div
                key={agent.name}
                className="flex items-center justify-between text-xs py-1.5 animate-fade-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--success)] pulse-dot" />
                  ) : (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--muted)]" />
                  )}
                  <i
                    className={`${strat?.icon ?? 'fa-solid fa-gear'} text-[10px]`}
                    style={{ color: strat?.color ?? 'var(--muted)' }}
                  />
                  <span className={isRunning ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}>
                    {agent.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--muted)]">
                    {agent.cycleCount > 0 ? `${agent.cycleCount} cycles` : ''}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      color: strat?.color ?? 'var(--muted)',
                      background: `color-mix(in srgb, ${strat?.color ?? 'var(--muted)'} 15%, transparent)`,
                    }}
                  >
                    {agent.strategy}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex items-center gap-2 py-3">
            <i className="fa-solid fa-circle-pause text-xs text-[var(--muted)]" />
            <p className="text-xs text-[var(--muted)]">No agents deployed</p>
          </div>
        )}
      </div>
    </div>
  );
}
