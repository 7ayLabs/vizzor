// ---------------------------------------------------------------------------
// PostgresStore — DataStore backed by PostgreSQL + TimescaleDB
// ---------------------------------------------------------------------------

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig, AgentCycleResult } from '../core/agent/types.js';
import type { DataStore, OHLCVRecord, MLPrediction, AccuracyReport } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function pgRowToConfig(r: {
  id: string;
  name: string;
  strategy: string;
  pairs: string[] | string;
  interval_seconds: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}): AgentConfig {
  return {
    id: r.id,
    name: r.name,
    strategy: r.strategy,
    pairs: typeof r.pairs === 'string' ? (JSON.parse(r.pairs) as string[]) : r.pairs,
    interval: r.interval_seconds,
    chains: r['chains']
      ? typeof r['chains'] === 'string'
        ? (JSON.parse(r['chains']) as string[])
        : (r['chains'] as string[])
      : ['ethereum'],
    mode: (r['mode'] as 'paper' | 'live') ?? 'paper',
    walletId: String(r['wallet_id'] ?? ''),
    riskConfig: {
      maxDailyLoss: Number(r['max_daily_loss'] ?? 100),
      maxPositionValue: Number(r['max_position_value'] ?? 1000),
      maxDrawdownPct: Number(r['max_drawdown_pct'] ?? 10),
    },
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export class PostgresStore implements DataStore {
  private pool: pg.Pool;
  private initialized = false;

  constructor(connectionUrl: string) {
    this.pool = new pg.Pool({ connectionString: connectionUrl, max: 10 });
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    const migrationPath = resolve(__dirname, 'migrations', '001-init.sql');
    const sql = readFileSync(migrationPath, 'utf-8');
    await this.pool.query(sql);
    this.initialized = true;
  }

  private async query<T extends pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    await this.init();
    return this.pool.query<T>(text, params);
  }

  // ---- Cache ---------------------------------------------------------------

  async getCached<T>(key: string): Promise<T | null> {
    const now = Math.floor(Date.now() / 1000);
    const { rows } = await this.query<{ value: unknown }>(
      'SELECT value FROM cache WHERE key = $1 AND expires_at > $2',
      [key, now],
    );
    if (rows.length === 0) return null;
    return rows[0].value as T;
  }

  async setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlSeconds;
    await this.query(
      `INSERT INTO cache (key, value, expires_at, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value = $2, expires_at = $3`,
      [key, JSON.stringify(value), expiresAt, now],
    );
  }

  // ---- Agents --------------------------------------------------------------

  async createAgent(config: AgentConfig): Promise<AgentConfig> {
    await this.query(
      `INSERT INTO agents (id, name, strategy, pairs, interval_seconds, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        config.id,
        config.name,
        config.strategy,
        JSON.stringify(config.pairs),
        config.interval,
        config.createdAt,
        config.updatedAt,
      ],
    );
    return config;
  }

  async listAgents(): Promise<AgentConfig[]> {
    const { rows } = await this.query<{
      id: string;
      name: string;
      strategy: string;
      pairs: string[];
      interval_seconds: number;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM agents ORDER BY created_at DESC');

    return rows.map((r) => pgRowToConfig(r));
  }

  async getAgentById(id: string): Promise<AgentConfig | null> {
    const { rows } = await this.query<{
      id: string;
      name: string;
      strategy: string;
      pairs: string[];
      interval_seconds: number;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM agents WHERE id = $1', [id]);

    if (rows.length === 0) return null;
    return pgRowToConfig(rows[0]);
  }

  async getAgentByName(name: string): Promise<AgentConfig | null> {
    const { rows } = await this.query<{
      id: string;
      name: string;
      strategy: string;
      pairs: string[];
      interval_seconds: number;
      created_at: string;
      updated_at: string;
    }>('SELECT * FROM agents WHERE name = $1', [name]);

    if (rows.length === 0) return null;
    return pgRowToConfig(rows[0]);
  }

  async deleteAgent(id: string): Promise<boolean> {
    const result = await this.query('DELETE FROM agents WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async logDecision(result: AgentCycleResult): Promise<void> {
    await this.query(
      `INSERT INTO agent_decisions (agent_id, symbol, action, confidence, reasoning, signals, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        result.agentId,
        result.symbol,
        result.decision.action,
        result.decision.confidence,
        JSON.stringify(result.decision.reasoning),
        JSON.stringify(result.signals),
        result.timestamp,
      ],
    );
  }

  async getDecisions(agentId: string, limit: number): Promise<AgentCycleResult[]> {
    const { rows } = await this.query<{
      agent_id: string;
      symbol: string;
      action: string;
      confidence: number;
      reasoning: string[] | string;
      signals: Record<string, unknown> | string;
      created_at: string;
    }>('SELECT * FROM agent_decisions WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2', [
      agentId,
      limit,
    ]);

    return rows.map((r) => ({
      agentId: r.agent_id,
      symbol: r.symbol,
      timestamp: Number(r.created_at),
      signals: (typeof r.signals === 'string'
        ? JSON.parse(r.signals)
        : r.signals) as AgentCycleResult['signals'],
      decision: {
        action: r.action as AgentCycleResult['decision']['action'],
        confidence: r.confidence,
        reasoning: (typeof r.reasoning === 'string'
          ? JSON.parse(r.reasoning)
          : r.reasoning) as string[],
      },
    }));
  }

  // ---- Time-series ---------------------------------------------------------

  async insertOHLCV(records: OHLCVRecord[]): Promise<void> {
    if (records.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const offset = i * 9;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
      );
      values.push(
        new Date(r.time).toISOString(),
        r.symbol,
        r.timeframe,
        r.open,
        r.high,
        r.low,
        r.close,
        r.volume,
        r.trades,
      );
    }

    await this.query(
      `INSERT INTO ohlcv (time, symbol, timeframe, open, high, low, close, volume, trades)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (symbol, timeframe, time) DO UPDATE
       SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
           close = EXCLUDED.close, volume = EXCLUDED.volume, trades = EXCLUDED.trades`,
      values,
    );
  }

  async queryOHLCV(
    symbol: string,
    timeframe: string,
    from: number,
    to: number,
  ): Promise<OHLCVRecord[]> {
    const { rows } = await this.query<{
      time: Date;
      symbol: string;
      timeframe: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      trades: number;
    }>(
      `SELECT * FROM ohlcv
       WHERE symbol = $1 AND timeframe = $2 AND time >= $3 AND time <= $4
       ORDER BY time ASC`,
      [symbol, timeframe, new Date(from).toISOString(), new Date(to).toISOString()],
    );

    return rows.map((r) => ({
      time: new Date(r.time).getTime(),
      symbol: r.symbol,
      timeframe: r.timeframe,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      trades: r.trades,
    }));
  }

  // ---- Predictions ---------------------------------------------------------

  async logPrediction(prediction: MLPrediction): Promise<void> {
    await this.query(
      `INSERT INTO predictions (symbol, model, direction, probability, horizon, features, predicted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        prediction.symbol,
        prediction.model,
        prediction.direction,
        prediction.probability,
        prediction.horizon,
        JSON.stringify(prediction.features),
        new Date(prediction.predictedAt).toISOString(),
      ],
    );
  }

  async getPredictionAccuracy(model: string, days: number): Promise<AccuracyReport> {
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const { rows: totals } = await this.query<{
      direction: string;
      total: string;
      correct: string;
    }>(
      `SELECT direction,
              COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE was_correct = true)::text AS correct
       FROM predictions
       WHERE model = $1 AND predicted_at >= $2 AND was_correct IS NOT NULL
       GROUP BY direction`,
      [model, since],
    );

    const byDir = {
      up: { total: 0, correct: 0, accuracy: 0 },
      down: { total: 0, correct: 0, accuracy: 0 },
      sideways: { total: 0, correct: 0, accuracy: 0 },
    };
    let totalAll = 0;
    let correctAll = 0;

    for (const row of totals) {
      const t = parseInt(row.total, 10);
      const c = parseInt(row.correct, 10);
      totalAll += t;
      correctAll += c;
      const dir = row.direction as keyof typeof byDir;
      if (byDir[dir]) {
        byDir[dir] = { total: t, correct: c, accuracy: t > 0 ? c / t : 0 };
      }
    }

    return {
      model,
      totalPredictions: totalAll,
      correctPredictions: correctAll,
      accuracy: totalAll > 0 ? correctAll / totalAll : 0,
      byDirection: byDir,
      period: `${days}d`,
    };
  }

  // ---- Lifecycle -----------------------------------------------------------

  async close(): Promise<void> {
    await this.pool.end();
  }
}
