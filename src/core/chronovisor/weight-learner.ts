// ---------------------------------------------------------------------------
// Weight learner — Bayesian weight updater for ChronoVisor signal categories
// ---------------------------------------------------------------------------

import type { WeightConfig } from './types.js';
import { getDb } from '../../data/cache.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('chronovisor:weight-learner');

const DEFAULT_WEIGHTS: WeightConfig = {
  onChain: 0.3,
  mlEnsemble: 0.25,
  predictionMarkets: 0.2,
  socialNarrative: 0.15,
  patternMatch: 0.1,
};

/** Keys of WeightConfig in a fixed order for consistency. */
const WEIGHT_KEYS: (keyof WeightConfig)[] = [
  'onChain',
  'mlEnsemble',
  'predictionMarkets',
  'socialNarrative',
  'patternMatch',
];

interface WeightRow {
  id: number;
  symbol: string;
  weights: string;
  accuracy: number;
  updated_at: number;
}

export class WeightLearner {
  constructor() {
    this.ensureTable();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Returns the learned weights for a specific symbol, falling back to
   * the global (symbol = '_global') weights, then to hard-coded defaults.
   */
  getWeights(symbol?: string): WeightConfig {
    const db = getDb();

    // Try symbol-specific first
    if (symbol) {
      const row = db
        .prepare('SELECT weights FROM chronovisor_weights WHERE symbol = ?')
        .get(symbol) as WeightRow | undefined;

      if (row) {
        return this.parseWeights(row.weights);
      }
    }

    // Try global
    const globalRow = db
      .prepare('SELECT weights FROM chronovisor_weights WHERE symbol = ?')
      .get('_global') as WeightRow | undefined;

    if (globalRow) {
      return this.parseWeights(globalRow.weights);
    }

    return { ...DEFAULT_WEIGHTS };
  }

  /**
   * Bayesian weight update: new_weight proportional to prior_weight * likelihood(accuracy).
   * The likelihood function maps accuracy (0-1) through a softmax-like transformation
   * so that better-performing signals receive higher weight.
   *
   * @param symbol   The token symbol for per-symbol adaptation
   * @param signalAccuracies  Map of signal key -> observed accuracy (0-1)
   */
  updateWeights(symbol: string, signalAccuracies: Record<string, number>): void {
    const prior = this.getWeights(symbol);

    // Compute posterior: weight_i * likelihood_i
    const posterior: Record<string, number> = {};
    let sum = 0;

    for (const key of WEIGHT_KEYS) {
      const priorWeight = prior[key];
      const accuracy = signalAccuracies[key] ?? 0.5; // uninformative prior on missing
      // Likelihood: exp(accuracy) to reward higher accuracy
      const likelihood = Math.exp(accuracy);
      const raw = priorWeight * likelihood;
      posterior[key] = raw;
      sum += raw;
    }

    // Normalize so weights sum to 1.0
    if (sum <= 0) {
      log.warn(`Weight normalization sum is ${sum} — resetting to defaults for ${symbol}`);
      this.resetWeights(symbol);
      return;
    }

    const normalized: WeightConfig = { ...DEFAULT_WEIGHTS };
    for (const key of WEIGHT_KEYS) {
      normalized[key] = (posterior[key] ?? 0) / sum;
    }

    // Compute overall accuracy for this update
    const accuracyValues = Object.values(signalAccuracies);
    const overallAccuracy =
      accuracyValues.length > 0
        ? accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length
        : 0;

    this.storeWeights(symbol, normalized, overallAccuracy);
    log.info(`Updated weights for ${symbol}: ${JSON.stringify(normalized)}`);
  }

  /**
   * Resets weights to defaults for a specific symbol or globally.
   */
  resetWeights(symbol?: string): void {
    const db = getDb();

    if (symbol) {
      db.prepare('DELETE FROM chronovisor_weights WHERE symbol = ?').run(symbol);
      log.info(`Reset weights for ${symbol}`);
    } else {
      db.prepare('DELETE FROM chronovisor_weights').run();
      log.info('Reset all chronovisor weights');
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private ensureTable(): void {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS chronovisor_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL UNIQUE,
        weights TEXT NOT NULL,
        accuracy REAL NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  private parseWeights(json: string): WeightConfig {
    try {
      const parsed: unknown = JSON.parse(json);
      if (typeof parsed !== 'object' || parsed === null) {
        return { ...DEFAULT_WEIGHTS };
      }

      const obj = parsed as Record<string, unknown>;
      const result: WeightConfig = { ...DEFAULT_WEIGHTS };

      for (const key of WEIGHT_KEYS) {
        const val = obj[key];
        if (typeof val === 'number' && isFinite(val) && val >= 0) {
          result[key] = val;
        }
      }

      return result;
    } catch {
      return { ...DEFAULT_WEIGHTS };
    }
  }

  private storeWeights(symbol: string, weights: WeightConfig, accuracy: number): void {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);

    db.prepare(
      `INSERT OR REPLACE INTO chronovisor_weights (symbol, weights, accuracy, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(symbol, JSON.stringify(weights), accuracy, now);
  }
}
