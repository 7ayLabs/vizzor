'use client';

import { useApi } from '@/hooks/use-api';
import type { Agent } from '@/lib/types';

const STRATEGY_ICONS: Record<string, { icon: string; color: string }> = {
  momentum: { icon: 'fa-solid fa-bolt', color: 'rgba(255,255,255,0.5)' },
  'trend-following': { icon: 'fa-solid fa-arrow-trend-up', color: 'rgba(255,255,255,0.45)' },
  'ml-adaptive': { icon: 'fa-solid fa-microchip', color: 'rgba(255,255,255,0.6)' },
};

export function AgentSummary() {
  const { data } = useApi<{ agents: Agent[] }>('/v1/agents');

  const agents = data?.agents ?? [];
  const running = agents.filter((a) => a.status === 'running').length;
  const total = agents.length;

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-3 sm:p-4 animate-fade-up stagger-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-robot text-xs text-white/40" />
          <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Agent Swarm
          </h3>
        </div>
        <span className="text-xs font-mono text-[var(--text-muted)]">
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
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                  )}
                  <i
                    className={`${strat?.icon ?? 'fa-solid fa-gear'} text-[10px]`}
                    style={{ color: strat?.color ?? 'var(--text-muted)' }}
                  />
                  <span className={isRunning ? 'text-white' : 'text-[var(--text-muted)]'}>
                    {agent.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    {agent.cycleCount > 0 ? `${agent.cycleCount} cycles` : ''}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white/[0.06] text-[var(--text-secondary)]">
                    {agent.strategy}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex items-center gap-2 py-3">
            <i className="fa-solid fa-circle-pause text-xs text-[var(--text-muted)]" />
            <p className="text-xs text-[var(--text-muted)]">No agents deployed</p>
          </div>
        )}
      </div>
    </div>
  );
}
