'use client';

import { useApi } from '@/hooks/use-api';
import { AgentCard } from '@/components/agents/agent-card';
import { AgentCreateForm } from '@/components/agents/agent-create-form';
import type { Agent } from '@/lib/types';

export default function AgentsPage() {
  const { data, error, isLoading, mutate } = useApi<{ agents: Agent[] }>('/v1/agents');

  const agents = data?.agents ?? [];
  const running = agents.filter((a) => a.status === 'running').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Trading Agents</h2>
          {running > 0 && (
            <span className="text-xs font-mono text-[var(--success)]">{running} running</span>
          )}
        </div>
      </div>

      <AgentCreateForm onCreated={() => mutate()} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
        {isLoading && <p className="text-xs text-[var(--muted)]">Loading agents...</p>}
        {error && <p className="text-xs text-[var(--danger)]">Error: {error.message}</p>}
        {agents.map((agent) => (
          <AgentCard key={agent.name} agent={agent} onAction={() => mutate()} />
        ))}
        {!isLoading && agents.length === 0 && (
          <p className="text-xs text-[var(--muted)] col-span-full">No agents deployed yet.</p>
        )}
      </div>
    </div>
  );
}
