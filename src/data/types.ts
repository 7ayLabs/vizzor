// ---------------------------------------------------------------------------
// DataStore abstraction — unified interface for SQLite and PostgreSQL backends
// ---------------------------------------------------------------------------

import type { AgentConfig, AgentCycleResult } from '../core/agent/types.js';

// ---------------------------------------------------------------------------
// Time-series types
// ---------------------------------------------------------------------------

export interface OHLCVRecord {
  time: number; // Unix timestamp (ms)
  symbol: string;
  timeframe: string; // '1h' | '4h' | '1d'
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

// ---------------------------------------------------------------------------
// ML prediction types
// ---------------------------------------------------------------------------

export interface MLPrediction {
  id?: string;
  symbol: string;
  model: string;
  direction: 'up' | 'down' | 'sideways';
  probability: number; // 0-1
  horizon: string; // '1h' | '4h' | '1d'
  features: Record<string, number>;
  predictedAt: number; // Unix timestamp (ms)
  // Evaluation fields (filled later)
  actualOutcome?: string;
  actualChangePct?: number;
  wasCorrect?: boolean;
  evaluatedAt?: number;
}

export interface AccuracyReport {
  model: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number; // 0-1
  byDirection: {
    up: { total: number; correct: number; accuracy: number };
    down: { total: number; correct: number; accuracy: number };
    sideways: { total: number; correct: number; accuracy: number };
  };
  period: string;
}

// ---------------------------------------------------------------------------
// DataStore interface
// ---------------------------------------------------------------------------

export interface DataStore {
  // Cache
  getCached<T>(key: string): Promise<T | null>;
  setCache(key: string, value: unknown, ttlSeconds: number): Promise<void>;

  // Agents
  createAgent(config: AgentConfig): Promise<AgentConfig>;
  listAgents(): Promise<AgentConfig[]>;
  getAgentById(id: string): Promise<AgentConfig | null>;
  getAgentByName(name: string): Promise<AgentConfig | null>;
  deleteAgent(id: string): Promise<boolean>;
  logDecision(result: AgentCycleResult): Promise<void>;
  getDecisions(agentId: string, limit: number): Promise<AgentCycleResult[]>;

  // Time-series (Postgres-only; SQLite returns empty/noop)
  insertOHLCV(records: OHLCVRecord[]): Promise<void>;
  queryOHLCV(symbol: string, timeframe: string, from: number, to: number): Promise<OHLCVRecord[]>;

  // Predictions
  logPrediction(prediction: MLPrediction): Promise<void>;
  getPredictionAccuracy(model: string, days: number): Promise<AccuracyReport>;

  // Lifecycle
  close(): Promise<void>;
}
