// ---------------------------------------------------------------------------
// Agent manager — CRUD, lifecycle, strategy registry
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { getDb } from '../../data/cache.js';
import type { AgentConfig, AgentState, AgentStrategy, AgentCycleResult } from './types.js';
import { AgentEngine } from './engine.js';
import { momentumStrategy } from './strategies/momentum.js';
import { trendFollowingStrategy } from './strategies/trend-following.js';
import { mlAdaptiveStrategy } from './strategies/ml-adaptive.js';

// ---------------------------------------------------------------------------
// Strategy registry
// ---------------------------------------------------------------------------

const STRATEGIES: Record<string, AgentStrategy> = {
  momentum: momentumStrategy,
  'trend-following': trendFollowingStrategy,
  'ml-adaptive': mlAdaptiveStrategy,
};

export function getStrategy(name: string): AgentStrategy {
  const strategy = STRATEGIES[name];
  if (!strategy) {
    throw new Error(`Unknown strategy: ${name}. Available: ${Object.keys(STRATEGIES).join(', ')}`);
  }
  return strategy;
}

export function listStrategies(): string[] {
  return Object.keys(STRATEGIES);
}

// ---------------------------------------------------------------------------
// Running engines
// ---------------------------------------------------------------------------

const engines = new Map<string, AgentEngine>();

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function ensureAgentTables(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      strategy TEXT NOT NULL,
      pairs TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL DEFAULT 60,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      reasoning TEXT NOT NULL,
      signals TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createAgent(
  name: string,
  strategy: string,
  pairs: string[],
  interval = 60,
): AgentConfig {
  ensureAgentTables();

  // Validate strategy
  getStrategy(strategy);

  // Check for duplicate name
  const existing = getAgentByName(name);
  if (existing) {
    throw new Error(`Agent "${name}" already exists. Delete it first or choose a different name.`);
  }

  const id = randomUUID();
  const now = Date.now();

  getDb()
    .prepare(
      `INSERT INTO agents (id, name, strategy, pairs, interval_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, name, strategy, JSON.stringify(pairs), interval, now, now);

  return { id, name, strategy, pairs, interval, createdAt: now, updatedAt: now };
}

export function listAgents(): AgentConfig[] {
  ensureAgentTables();

  const rows = getDb().prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as {
    id: string;
    name: string;
    strategy: string;
    pairs: string;
    interval_seconds: number;
    created_at: number;
    updated_at: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    strategy: r.strategy,
    pairs: JSON.parse(r.pairs) as string[],
    interval: r.interval_seconds,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getAgentById(id: string): AgentConfig | null {
  ensureAgentTables();

  const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        strategy: string;
        pairs: string;
        interval_seconds: number;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy,
    pairs: JSON.parse(row.pairs) as string[],
    interval: row.interval_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAgentByName(name: string): AgentConfig | null {
  ensureAgentTables();

  const row = getDb().prepare('SELECT * FROM agents WHERE name = ?').get(name) as
    | {
        id: string;
        name: string;
        strategy: string;
        pairs: string;
        interval_seconds: number;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy,
    pairs: JSON.parse(row.pairs) as string[],
    interval: row.interval_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deleteAgent(id: string): boolean {
  ensureAgentTables();

  // Stop engine if running
  const engine = engines.get(id);
  if (engine) {
    engine.stop();
    engines.delete(id);
  }

  getDb().prepare('DELETE FROM agent_decisions WHERE agent_id = ?').run(id);
  const result = getDb().prepare('DELETE FROM agents WHERE id = ?').run(id);

  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startAgent(id: string): AgentState {
  const config = getAgentById(id);
  if (!config) throw new Error(`Agent not found: ${id}`);

  // Check if already running — prevent double-start race
  const existing = engines.get(id);
  if (existing) {
    const state = existing.getState();
    if (state.status === 'running') {
      return state;
    }
  }

  const engine = new AgentEngine(config);
  engines.set(id, engine);

  engine.start();
  return engine.getState();
}

export function stopAgent(id: string): AgentState {
  const engine = engines.get(id);
  if (!engine) {
    const config = getAgentById(id);
    if (!config) throw new Error(`Agent not found: ${id}`);
    return { config, status: 'idle', lastCycle: null, cycleCount: 0, error: null };
  }

  engine.stop();
  return engine.getState();
}

export function getAgentStatus(id: string): AgentState | null {
  const engine = engines.get(id);
  if (engine) return engine.getState();

  // Agent exists but not running
  const config = getAgentById(id);
  if (!config) return null;

  return {
    config,
    status: 'idle',
    lastCycle: null,
    cycleCount: 0,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Decision logging
// ---------------------------------------------------------------------------

let pruneCounter = 0;

export function logDecision(result: AgentCycleResult): void {
  ensureAgentTables();

  getDb()
    .prepare(
      `INSERT INTO agent_decisions (agent_id, symbol, action, confidence, reasoning, signals, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      result.agentId,
      result.symbol,
      result.decision.action,
      result.decision.confidence,
      JSON.stringify(result.decision.reasoning),
      JSON.stringify(result.signals),
      result.timestamp,
    );

  // Prune old decisions every 100 log calls to prevent unbounded growth
  pruneCounter++;
  if (pruneCounter >= 100) {
    pruneCounter = 0;
    pruneDecisions(result.agentId, 1000);
  }
}

/**
 * Prune old decisions beyond the retention limit per agent.
 * Keeps at most `keep` most recent decisions.
 */
export function pruneDecisions(agentId: string, keep = 1000): number {
  ensureAgentTables();

  const result = getDb()
    .prepare(
      `DELETE FROM agent_decisions WHERE agent_id = ? AND id NOT IN (
        SELECT id FROM agent_decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
      )`,
    )
    .run(agentId, agentId, keep);

  return result.changes;
}

export function getRecentDecisions(agentId: string, limit = 20): AgentCycleResult[] {
  ensureAgentTables();

  const rows = getDb()
    .prepare(`SELECT * FROM agent_decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(agentId, limit) as {
    agent_id: string;
    symbol: string;
    action: string;
    confidence: number;
    reasoning: string;
    signals: string;
    created_at: number;
  }[];

  return rows
    .map((r) => {
      try {
        return {
          agentId: r.agent_id,
          symbol: r.symbol,
          timestamp: r.created_at,
          signals: JSON.parse(r.signals) as AgentCycleResult['signals'],
          decision: {
            action: r.action as AgentCycleResult['decision']['action'],
            confidence: r.confidence,
            reasoning: JSON.parse(r.reasoning) as string[],
          },
        };
      } catch {
        return null;
      }
    })
    .filter((r): r is AgentCycleResult => r !== null);
}
