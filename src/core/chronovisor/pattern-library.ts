// ---------------------------------------------------------------------------
// Pattern library — cosine similarity matching against historical patterns
// ---------------------------------------------------------------------------

import { getDb } from '../../data/cache.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('chronovisor:patterns');

interface PatternRow {
  id: string;
  name: string;
  feature_vector: string;
  outcome: string;
  profit_pct: number;
  created_at: number;
}

export interface PatternMatch {
  name: string;
  similarity: number;
  outcome: string;
  profitPct: number;
}

export interface PatternStats {
  total: number;
  avgProfit: number;
  profitableCount: number;
}

export class PatternLibrary {
  constructor() {
    this.ensureTable();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Store a new pattern with its feature vector, observed outcome, and profit %.
   */
  addPattern(name: string, features: number[], outcome: string, profitPct: number): void {
    const db = getDb();
    const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT INTO chronovisor_patterns (id, name, feature_vector, outcome, profit_pct, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, name, JSON.stringify(features), outcome, profitPct, now);

    log.debug(`Added pattern "${name}" (${features.length} features, outcome: ${outcome})`);
  }

  /**
   * Find the top-K most similar stored patterns to the given feature vector
   * using cosine similarity.
   */
  findSimilarPatterns(features: number[], topK = 5): PatternMatch[] {
    const db = getDb();

    const rows = db
      .prepare('SELECT name, feature_vector, outcome, profit_pct FROM chronovisor_patterns')
      .all() as PatternRow[];

    if (rows.length === 0) {
      return [];
    }

    const scored: PatternMatch[] = [];

    for (const row of rows) {
      const stored = this.parseFeatureVector(row.feature_vector);
      if (!stored || stored.length !== features.length) {
        continue;
      }

      const similarity = this.cosineSimilarity(features, stored);

      scored.push({
        name: row.name,
        similarity,
        outcome: row.outcome,
        profitPct: row.profit_pct,
      });
    }

    // Sort descending by similarity and take topK
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * Returns aggregate statistics about stored patterns.
   */
  getPatternStats(): PatternStats {
    const db = getDb();

    const row = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           COALESCE(AVG(profit_pct), 0) as avg_profit,
           SUM(CASE WHEN profit_pct > 0 THEN 1 ELSE 0 END) as profitable_count
         FROM chronovisor_patterns`,
      )
      .get() as { total: number; avg_profit: number; profitable_count: number } | undefined;

    return {
      total: row?.total ?? 0,
      avgProfit: row?.avg_profit ?? 0,
      profitableCount: row?.profitable_count ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Cosine similarity: cos(A, B) = (A . B) / (|A| x |B|)
   * Returns 0 if either vector has zero magnitude.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dotProduct += valA * valB;
      magnitudeA += valA * valA;
      magnitudeB += valB * valB;
    }

    const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  private parseFeatureVector(json: string): number[] | null {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) return null;

      const result: number[] = [];
      for (const val of parsed) {
        if (typeof val !== 'number' || !isFinite(val)) return null;
        result.push(val);
      }
      return result;
    } catch {
      return null;
    }
  }

  private ensureTable(): void {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS chronovisor_patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        feature_vector TEXT NOT NULL,
        outcome TEXT NOT NULL,
        profit_pct REAL NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }
}
