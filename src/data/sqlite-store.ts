// ---------------------------------------------------------------------------
// SqliteStore — wraps existing SQLite layer behind the DataStore interface
// ---------------------------------------------------------------------------

import { getDb, getCached, setCache } from './cache.js';
import type { AgentConfig, AgentCycleResult } from '../core/agent/types.js';
import type { DataStore, OHLCVRecord, MLPrediction, AccuracyReport } from './types.js';

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

function rowToConfig(row: {
  id: string;
  name: string;
  strategy: string;
  pairs: string;
  interval_seconds: number;
  created_at: number;
  updated_at: number;
}): AgentConfig {
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

export class SqliteStore implements DataStore {
  // ---- Cache ---------------------------------------------------------------

  async getCached<T>(key: string): Promise<T | null> {
    return getCached<T>(key);
  }

  async setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    setCache(key, value, ttlSeconds);
  }

  // ---- Agents --------------------------------------------------------------

  async createAgent(config: AgentConfig): Promise<AgentConfig> {
    ensureAgentTables();
    getDb()
      .prepare(
        `INSERT INTO agents (id, name, strategy, pairs, interval_seconds, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        config.id,
        config.name,
        config.strategy,
        JSON.stringify(config.pairs),
        config.interval,
        config.createdAt,
        config.updatedAt,
      );
    return config;
  }

  async listAgents(): Promise<AgentConfig[]> {
    ensureAgentTables();
    const rows = getDb()
      .prepare('SELECT * FROM agents ORDER BY created_at DESC')
      .all() as Parameters<typeof rowToConfig>[0][];
    return rows.map(rowToConfig);
  }

  async getAgentById(id: string): Promise<AgentConfig | null> {
    ensureAgentTables();
    const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as
      | Parameters<typeof rowToConfig>[0]
      | undefined;
    return row ? rowToConfig(row) : null;
  }

  async getAgentByName(name: string): Promise<AgentConfig | null> {
    ensureAgentTables();
    const row = getDb().prepare('SELECT * FROM agents WHERE name = ?').get(name) as
      | Parameters<typeof rowToConfig>[0]
      | undefined;
    return row ? rowToConfig(row) : null;
  }

  async deleteAgent(id: string): Promise<boolean> {
    ensureAgentTables();
    const result = getDb().prepare('DELETE FROM agents WHERE id = ?').run(id);
    getDb().prepare('DELETE FROM agent_decisions WHERE agent_id = ?').run(id);
    return result.changes > 0;
  }

  async logDecision(result: AgentCycleResult): Promise<void> {
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
  }

  async getDecisions(agentId: string, limit: number): Promise<AgentCycleResult[]> {
    ensureAgentTables();
    const rows = getDb()
      .prepare('SELECT * FROM agent_decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(agentId, limit) as {
      agent_id: string;
      symbol: string;
      action: string;
      confidence: number;
      reasoning: string;
      signals: string;
      created_at: number;
    }[];
    return rows.map((r) => ({
      agentId: r.agent_id,
      symbol: r.symbol,
      timestamp: r.created_at,
      signals: JSON.parse(r.signals) as AgentCycleResult['signals'],
      decision: {
        action: r.action as AgentCycleResult['decision']['action'],
        confidence: r.confidence,
        reasoning: JSON.parse(r.reasoning) as string[],
      },
    }));
  }

  // ---- Time-series (no-op for SQLite) --------------------------------------

  async insertOHLCV(_records: OHLCVRecord[]): Promise<void> {
    // SQLite does not support time-series; silently skip
  }

  async queryOHLCV(
    _symbol: string,
    _timeframe: string,
    _from: number,
    _to: number,
  ): Promise<OHLCVRecord[]> {
    return [];
  }

  // ---- Predictions (no-op for SQLite) --------------------------------------

  async logPrediction(_prediction: MLPrediction): Promise<void> {
    // Not supported in SQLite mode
  }

  async getPredictionAccuracy(_model: string, _days: number): Promise<AccuracyReport> {
    return {
      model: _model,
      totalPredictions: 0,
      correctPredictions: 0,
      accuracy: 0,
      byDirection: {
        up: { total: 0, correct: 0, accuracy: 0 },
        down: { total: 0, correct: 0, accuracy: 0 },
        sideways: { total: 0, correct: 0, accuracy: 0 },
      },
      period: `${_days}d`,
    };
  }

  // ---- Lifecycle -----------------------------------------------------------

  async close(): Promise<void> {
    // SQLite handles cleanup via process exit; nothing to do
  }
}
