// ---------------------------------------------------------------------------
// Accuracy tracker — logs predictions and computes per-model accuracy
// ---------------------------------------------------------------------------

import type { PredictionRecord } from './types.js';
import { getDb } from '../../data/cache.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('chronovisor:accuracy');

interface PredictionRow {
  id: string;
  symbol: string;
  horizon: string;
  predicted_direction: string;
  probability: number;
  composite_score: number;
  initial_price: number;
  created_at: number;
  resolved_at: number | null;
  actual_direction: string | null;
  was_correct: number | null;
}

export class AccuracyTracker {
  constructor() {
    this.ensureTable();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Log a new prediction for future accuracy tracking.
   */
  logPrediction(
    record: Omit<PredictionRecord, 'resolvedAt' | 'actualDirection' | 'wasCorrect'>,
  ): void {
    const db = getDb();

    db.prepare(
      `INSERT OR IGNORE INTO chronovisor_predictions
       (id, symbol, horizon, predicted_direction, probability, composite_score, initial_price, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record.id,
      record.symbol,
      record.horizon,
      record.predictedDirection,
      record.probability,
      record.compositeScore,
      record.initialPrice,
      record.createdAt,
    );

    log.debug(
      `Logged prediction ${record.id}: ${record.symbol} ${record.horizon} ${record.predictedDirection} @ $${record.initialPrice}`,
    );
  }

  /**
   * Resolve a prediction by recording the actual outcome.
   */
  resolvePrediction(id: string, actualDirection: string, _actualPrice: number): void {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    // Fetch the original prediction to determine correctness
    const row = db
      .prepare('SELECT predicted_direction FROM chronovisor_predictions WHERE id = ?')
      .get(id) as Pick<PredictionRow, 'predicted_direction'> | undefined;

    if (!row) {
      log.warn(`Cannot resolve prediction ${id} — not found`);
      return;
    }

    const wasCorrect = row.predicted_direction === actualDirection ? 1 : 0;

    db.prepare(
      `UPDATE chronovisor_predictions
       SET resolved_at = ?, actual_direction = ?, was_correct = ?
       WHERE id = ?`,
    ).run(now, actualDirection, wasCorrect, id);

    log.info(
      `Resolved prediction ${id}: ${wasCorrect ? 'correct' : 'incorrect'} (actual: ${actualDirection})`,
    );
  }

  /**
   * Compute accuracy metrics, optionally filtered by symbol, horizon, and/or
   * a lookback window in days.
   */
  getAccuracy(
    symbol?: string,
    horizon?: string,
    days?: number,
  ): { overall: number; total: number; correct: number; byHorizon: Record<string, number> } {
    const db = getDb();
    const conditions: string[] = ['was_correct IS NOT NULL'];
    const params: unknown[] = [];

    if (symbol) {
      conditions.push('symbol = ?');
      params.push(symbol);
    }
    if (horizon) {
      conditions.push('horizon = ?');
      params.push(horizon);
    }
    if (days) {
      const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
      conditions.push('created_at >= ?');
      params.push(cutoff);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Overall accuracy
    const totalRow = db
      .prepare(
        `SELECT COUNT(*) as total, SUM(was_correct) as correct FROM chronovisor_predictions ${where}`,
      )
      .get(...params) as { total: number; correct: number } | undefined;

    const total = totalRow?.total ?? 0;
    const correct = totalRow?.correct ?? 0;
    const overall = total > 0 ? correct / total : 0;

    // Per-horizon accuracy
    const horizonRows = db
      .prepare(
        `SELECT horizon, COUNT(*) as total, SUM(was_correct) as correct
         FROM chronovisor_predictions ${where}
         GROUP BY horizon`,
      )
      .all(...params) as { horizon: string; total: number; correct: number }[];

    const byHorizon: Record<string, number> = {};
    for (const row of horizonRows) {
      byHorizon[row.horizon] = row.total > 0 ? row.correct / row.total : 0;
    }

    return { overall, total, correct, byHorizon };
  }

  /**
   * Returns all unresolved (pending) predictions.
   */
  getPendingPredictions(): PredictionRecord[] {
    const db = getDb();

    const rows = db
      .prepare(
        'SELECT * FROM chronovisor_predictions WHERE resolved_at IS NULL ORDER BY created_at DESC',
      )
      .all() as PredictionRow[];

    return rows.map(this.rowToRecord);
  }

  /**
   * Returns recent predictions for a specific symbol.
   */
  getRecentPredictions(symbol: string, limit = 20): PredictionRecord[] {
    const db = getDb();

    const rows = db
      .prepare(
        'SELECT * FROM chronovisor_predictions WHERE symbol = ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(symbol, limit) as PredictionRow[];

    return rows.map(this.rowToRecord);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private ensureTable(): void {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS chronovisor_predictions (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        horizon TEXT NOT NULL,
        predicted_direction TEXT NOT NULL,
        probability REAL NOT NULL,
        composite_score REAL NOT NULL,
        initial_price REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER,
        actual_direction TEXT,
        was_correct INTEGER
      )
    `);
    // Migration: add initial_price column if missing (pre-v0.12.5 tables)
    try {
      db.exec(
        'ALTER TABLE chronovisor_predictions ADD COLUMN initial_price REAL NOT NULL DEFAULT 0',
      );
    } catch {
      // Column already exists
    }
  }

  private rowToRecord(row: PredictionRow): PredictionRecord {
    return {
      id: row.id,
      symbol: row.symbol,
      horizon: row.horizon,
      predictedDirection: row.predicted_direction as PredictionRecord['predictedDirection'],
      probability: row.probability,
      compositeScore: row.composite_score,
      initialPrice: row.initial_price,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      actualDirection: row.actual_direction as PredictionRecord['actualDirection'],
      wasCorrect: row.was_correct === null ? null : row.was_correct === 1,
    };
  }
}
