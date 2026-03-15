import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database before importing agent manager
vi.mock('@/data/cache.js', () => {
  // In-memory SQLite-like store using Map
  const tables = new Map<string, unknown[]>();
  const stmtRun = vi.fn();
  const stmtAll = vi.fn();
  const stmtGet = vi.fn();

  // Simple in-memory DB mock
  const rows: Record<string, unknown>[] = [];

  const db = {
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      return {
        run: (...args: unknown[]) => {
          if (sql.includes('INSERT INTO agents')) {
            rows.push({
              id: args[0],
              name: args[1],
              strategy: args[2],
              pairs: args[3],
              interval_seconds: args[4],
              created_at: args[5],
              updated_at: args[6],
            });
            return { changes: 1 };
          }
          if (sql.includes('DELETE FROM agents')) {
            const idx = rows.findIndex((r) => r.id === args[0]);
            if (idx >= 0) {
              rows.splice(idx, 1);
              return { changes: 1 };
            }
            return { changes: 0 };
          }
          if (sql.includes('DELETE FROM agent_decisions')) {
            return { changes: 0 };
          }
          return { changes: 0 };
        },
        all: (...args: unknown[]) => {
          if (sql.includes('SELECT * FROM agents ORDER BY')) {
            return [...rows].reverse();
          }
          if (sql.includes('SELECT * FROM agent_decisions')) {
            return [];
          }
          return [];
        },
        get: (...args: unknown[]) => {
          if (sql.includes('WHERE id =')) {
            return rows.find((r) => r.id === args[0]);
          }
          if (sql.includes('WHERE name =')) {
            return rows.find((r) => r.name === args[0]);
          }
          return undefined;
        },
      };
    }),
  };

  return {
    getDb: () => db,
  };
});

// Mock the agent engine to avoid real timer/network usage
vi.mock('@/core/agent/engine.js', () => {
  return {
    AgentEngine: vi.fn(function (this: Record<string, unknown>, config: unknown) {
      let status = 'idle';
      this.start = vi.fn(() => {
        status = 'running';
      });
      this.stop = vi.fn(() => {
        status = 'stopped';
      });
      this.getState = vi.fn(() => ({
        config,
        status,
        lastCycle: null,
        cycleCount: 0,
        error: null,
      }));
    }),
  };
});

// Mock strategy modules
vi.mock('@/core/agent/strategies/momentum.js', () => ({
  momentumStrategy: { name: 'momentum', description: 'test', evaluate: vi.fn() },
}));
vi.mock('@/core/agent/strategies/trend-following.js', () => ({
  trendFollowingStrategy: { name: 'trend-following', description: 'test', evaluate: vi.fn() },
}));
vi.mock('@/core/agent/strategies/ml-adaptive.js', () => ({
  mlAdaptiveStrategy: { name: 'ml-adaptive', description: 'test', evaluate: vi.fn() },
}));

import {
  createAgent,
  listAgents,
  deleteAgent,
  getAgentByName,
  startAgent,
  stopAgent,
  getAgentStatus,
  listStrategies,
} from '@/core/agent/index.js';

describe('Agent Lifecycle', () => {
  it('createAgent returns a valid config', () => {
    const name = `test-create-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['BTC'], 60);
    expect(agent.name).toBe(name);
    expect(agent.strategy).toBe('momentum');
    expect(agent.pairs).toEqual(['BTC']);
    expect(agent.interval).toBe(60);
    expect(agent.id).toBeTruthy();
    expect(agent.createdAt).toBeGreaterThan(0);
    deleteAgent(agent.id);
  });

  it('listAgents includes created agents', () => {
    const name = `test-list-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['ETH'], 60);
    const list = listAgents();
    expect(list.some((a) => a.name === name)).toBe(true);
    deleteAgent(agent.id);
  });

  it('deleteAgent removes the agent', () => {
    const name = `test-del-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['BTC'], 60);
    deleteAgent(agent.id);
    const found = getAgentByName(name);
    expect(found).toBeNull();
  });

  it('getAgentByName returns the agent', () => {
    const name = `test-find-${Date.now()}`;
    const agent = createAgent(name, 'trend-following', ['SOL'], 120);
    const found = getAgentByName(name);
    expect(found?.id).toBe(agent.id);
    expect(found?.strategy).toBe('trend-following');
    deleteAgent(agent.id);
  });

  it('startAgent sets status to running', () => {
    const name = `test-start-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['BTC'], 60);
    const state = startAgent(agent.id);
    expect(state.status).toBe('running');
    stopAgent(agent.id);
    deleteAgent(agent.id);
  });

  it('stopAgent sets status to stopped', () => {
    const name = `test-stop-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['BTC'], 60);
    startAgent(agent.id);
    const state = stopAgent(agent.id);
    expect(state.status).toBe('stopped');
    deleteAgent(agent.id);
  });

  it('getAgentStatus returns idle for non-started agent', () => {
    const name = `test-status-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['BTC'], 60);
    const status = getAgentStatus(agent.id);
    expect(status?.status).toBe('idle');
    deleteAgent(agent.id);
  });

  it('getAgentStatus returns null for unknown id', () => {
    const status = getAgentStatus('nonexistent-id');
    expect(status).toBeNull();
  });

  it('prevents double-start by returning existing state', () => {
    const name = `test-double-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['BTC'], 60);
    const state1 = startAgent(agent.id);
    expect(state1.status).toBe('running');
    // Starting again should return running state without error
    const state2 = startAgent(agent.id);
    expect(state2.status).toBe('running');
    stopAgent(agent.id);
    deleteAgent(agent.id);
  });

  it('createAgent throws on duplicate name', () => {
    const name = `test-dup-${Date.now()}`;
    createAgent(name, 'momentum', ['BTC'], 60);
    expect(() => createAgent(name, 'momentum', ['ETH'], 60)).toThrow('already exists');
    const agent = getAgentByName(name);
    if (agent) deleteAgent(agent.id);
  });

  it('createAgent throws on unknown strategy', () => {
    expect(() => createAgent(`test-bad-${Date.now()}`, 'nonexistent', ['BTC'], 60)).toThrow(
      'Unknown strategy',
    );
  });

  it('listStrategies returns available strategies', () => {
    const strategies = listStrategies();
    expect(strategies).toContain('momentum');
    expect(strategies).toContain('trend-following');
    expect(strategies).toContain('ml-adaptive');
  });

  it('stopAgent returns idle for non-running agent', () => {
    const name = `test-stop-idle-${Date.now()}`;
    const agent = createAgent(name, 'momentum', ['BTC'], 60);
    const state = stopAgent(agent.id);
    expect(state.status).toBe('idle');
    deleteAgent(agent.id);
  });
});
