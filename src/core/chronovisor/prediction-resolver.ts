// ---------------------------------------------------------------------------
// PredictionResolver — automatic feedback loop for ChronoVisor predictions
// Periodically resolves expired predictions by comparing initial vs current
// price, then updates WeightLearner for Bayesian weight adaptation.
// ---------------------------------------------------------------------------

import type { PredictionRecord, WeightConfig } from './types.js';
import type { AccuracyTracker } from './accuracy-tracker.js';
import type { WeightLearner } from './weight-learner.js';
import type { PatternLibrary } from './pattern-library.js';
import { createLogger } from '../../utils/logger.js';
import { emitNotification } from '../../notifications/event-bus.js';

const log = createLogger('chronovisor:resolver');

/** Maps horizon strings to their duration in seconds. */
const HORIZON_SECONDS: Record<string, number> = {
  '5m': 300,
  '15m': 900,
  '30m': 1_800,
  '1h': 3_600,
  '4h': 14_400,
  '1d': 86_400,
  '7d': 604_800,
};

/**
 * Minimum price change % to classify as up/down (avoid noise).
 * Scalping horizons use a tighter threshold since smaller moves are meaningful.
 */
const SIDEWAYS_THRESHOLD: Record<string, number> = {
  '5m': 0.05,
  '15m': 0.1,
  '30m': 0.15,
  '1h': 0.3,
  '4h': 0.3,
  '1d': 0.3,
  '7d': 0.3,
};

/** Maximum resolve cycle interval (used when no predictions are pending). */
const MAX_INTERVAL_MS = 15 * 60 * 1000;

/** Minimum resolve cycle interval (floor to avoid busy-looping). */
const MIN_INTERVAL_MS = 10 * 1000; // 10 seconds

/** Grace period after horizon expires before attempting resolve (allows price to settle). */
const GRACE_MS = 5_000; // 5 seconds

/** Weight keys for signal accuracy tracking. */
const WEIGHT_KEYS: (keyof WeightConfig)[] = [
  'onChain',
  'mlEnsemble',
  'predictionMarkets',
  'socialNarrative',
  'patternMatch',
  'logicRules',
];

export interface ResolverStats {
  totalResolved: number;
  correct: number;
  incorrect: number;
  lastRunAt: number | null;
  isRunning: boolean;
}

export class PredictionResolver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private stats: ResolverStats = {
    totalResolved: 0,
    correct: 0,
    incorrect: 0,
    lastRunAt: null,
    isRunning: false,
  };

  private readonly tracker: AccuracyTracker;
  private readonly learner: WeightLearner;
  private readonly patternLibrary: PatternLibrary | null;
  private readonly maxIntervalMs: number;

  /**
   * @param tracker  AccuracyTracker instance (from ChronoVisorEngine)
   * @param learner  WeightLearner instance (from ChronoVisorEngine)
   * @param patternLibrary  PatternLibrary instance for auto-population (optional)
   * @param maxIntervalMs  Max interval between resolve cycles (default 15 min).
   *   The resolver adaptively shortens this when scalping predictions are pending.
   */
  constructor(
    tracker: AccuracyTracker,
    learner: WeightLearner,
    patternLibrary?: PatternLibrary,
    maxIntervalMs = MAX_INTERVAL_MS,
  ) {
    this.tracker = tracker;
    this.learner = learner;
    this.patternLibrary = patternLibrary ?? null;
    this.maxIntervalMs = Math.max(MIN_INTERVAL_MS, maxIntervalMs);
  }

  // -------------------------------------------------------------------------
  // Lifecycle (follows AgentEngine setTimeout-chain pattern)
  // -------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stats.isRunning = true;
    log.info(`PredictionResolver started (adaptive, max interval: ${this.maxIntervalMs / 1000}s)`);
    void this.scheduleNextCycle(true); // run immediately
  }

  stop(): void {
    this.running = false;
    this.stats.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    log.info('PredictionResolver stopped');
  }

  getStats(): ResolverStats {
    return { ...this.stats };
  }

  // -------------------------------------------------------------------------
  // Core resolve cycle
  // -------------------------------------------------------------------------

  /**
   * Resolve all pending predictions whose horizon has expired.
   * Returns the number of predictions resolved in this cycle.
   */
  async resolvePending(): Promise<number> {
    const pending = this.tracker.getPendingPredictions();
    const now = Math.floor(Date.now() / 1000);
    let resolved = 0;

    // Group expired predictions by symbol for batch price fetch
    const expiredBySymbol = new Map<string, PredictionRecord[]>();

    for (const pred of pending) {
      const windowSec = HORIZON_SECONDS[pred.horizon] ?? 3600;
      if (now - pred.createdAt < windowSec) continue; // not yet expired
      if (pred.initialPrice <= 0) continue; // no initial price (pre-migration)

      const existing = expiredBySymbol.get(pred.symbol) ?? [];
      existing.push(pred);
      expiredBySymbol.set(pred.symbol, existing);
    }

    if (expiredBySymbol.size === 0) {
      log.debug('No expired predictions to resolve');
      return 0;
    }

    // Lazy import to avoid circular deps
    const { fetchTickerPrice } = await import('../../data/sources/binance.js');

    // Resolve each symbol's predictions
    for (const [symbol, predictions] of expiredBySymbol) {
      let currentPrice: number;
      try {
        const ticker = await fetchTickerPrice(symbol);
        currentPrice = ticker.price;
      } catch (err) {
        log.debug(
          `Failed to fetch price for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
        );
        continue; // skip this symbol, try next cycle
      }

      for (const pred of predictions) {
        const changePct = ((currentPrice - pred.initialPrice) / pred.initialPrice) * 100;

        const threshold = SIDEWAYS_THRESHOLD[pred.horizon] ?? 0.3;
        let actualDirection: 'up' | 'down' | 'sideways';
        if (changePct > threshold) {
          actualDirection = 'up';
        } else if (changePct < -threshold) {
          actualDirection = 'down';
        } else {
          actualDirection = 'sideways';
        }

        this.tracker.resolvePrediction(pred.id, actualDirection, currentPrice);
        resolved++;

        const wasCorrect = pred.predictedDirection === actualDirection;
        if (wasCorrect) {
          this.stats.correct++;
        } else {
          this.stats.incorrect++;
        }
        this.stats.totalResolved++;

        log.info(
          `Resolved ${pred.symbol} ${pred.horizon}: predicted=${pred.predictedDirection}, actual=${actualDirection} (${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%) → ${wasCorrect ? 'CORRECT' : 'INCORRECT'}`,
        );

        emitNotification({
          type: 'prediction_resolved',
          title: `Prediction ${wasCorrect ? 'Correct' : 'Incorrect'}: ${pred.symbol}`,
          message: `${pred.horizon} prediction was ${wasCorrect ? 'CORRECT' : 'INCORRECT'} — predicted ${pred.predictedDirection}, actual ${actualDirection} (${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%)`,
          severity: wasCorrect ? 'info' : 'warning',
          symbol: pred.symbol,
          metadata: {
            horizon: pred.horizon,
            predictedDirection: pred.predictedDirection,
            actualDirection,
            changePct,
            wasCorrect,
            initialPrice: pred.initialPrice,
            currentPrice,
          },
        });

        // Auto-populate pattern library from resolved predictions
        if (this.patternLibrary && pred.signalSnapshot) {
          try {
            const snapValues = Object.values(pred.signalSnapshot);
            if (snapValues.length > 0) {
              const featureVector = snapValues.map((s) => s.cf);
              this.patternLibrary.addPattern(
                `${pred.symbol}_${pred.horizon}_${actualDirection}`,
                featureVector,
                actualDirection,
                changePct,
              );
            }
          } catch {
            // Pattern storage is best-effort
          }
        }
      }

      // After resolving all predictions for this symbol, update weights
      this.updateSymbolWeights(symbol);
    }

    this.stats.lastRunAt = Date.now();

    if (resolved > 0) {
      const accuracy =
        this.stats.totalResolved > 0
          ? ((this.stats.correct / this.stats.totalResolved) * 100).toFixed(1)
          : '0.0';
      log.info(
        `Resolved ${resolved} predictions. Running accuracy: ${accuracy}% (${this.stats.correct}/${this.stats.totalResolved})`,
      );

      // Check accuracy milestones
      const accuracyNum = parseFloat(accuracy);
      for (const milestone of [60, 70, 80, 90]) {
        if (accuracyNum >= milestone && this.stats.totalResolved >= 10) {
          emitNotification({
            type: 'prediction_accuracy_milestone',
            title: `Accuracy Milestone: ${milestone}%`,
            message: `ChronoVisor predictions have reached ${accuracy}% accuracy (${this.stats.correct}/${this.stats.totalResolved})`,
            severity: milestone >= 80 ? 'info' : 'warning',
            metadata: {
              milestone,
              accuracy: accuracyNum,
              correct: this.stats.correct,
              total: this.stats.totalResolved,
            },
          });
          break; // Only emit highest milestone
        }
      }
    }

    return resolved;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Compute adaptive delay: sleep until the soonest prediction expires + grace,
   * clamped between MIN_INTERVAL_MS and maxIntervalMs.
   */
  private computeNextDelay(): number {
    const pending = this.tracker.getPendingPredictions();
    if (pending.length === 0) return this.maxIntervalMs;

    const now = Math.floor(Date.now() / 1000);
    let soonestExpiry = Infinity;

    for (const pred of pending) {
      const windowSec = HORIZON_SECONDS[pred.horizon] ?? 3600;
      const expiresAt = pred.createdAt + windowSec;
      if (expiresAt < soonestExpiry) {
        soonestExpiry = expiresAt;
      }
    }

    if (soonestExpiry === Infinity) return this.maxIntervalMs;

    // Time until soonest expiry + grace period
    const msUntilExpiry = (soonestExpiry - now) * 1000 + GRACE_MS;

    // If already expired, resolve ASAP (with minimum floor)
    if (msUntilExpiry <= 0) return MIN_INTERVAL_MS;

    // Clamp between min and max
    return Math.max(MIN_INTERVAL_MS, Math.min(this.maxIntervalMs, msUntilExpiry));
  }

  private async scheduleNextCycle(immediate: boolean): Promise<void> {
    if (!immediate) {
      const delay = this.computeNextDelay();
      log.debug(`Next resolve cycle in ${(delay / 1000).toFixed(0)}s`);
      await new Promise<void>((resolve) => {
        this.timer = setTimeout(resolve, delay);
      });
    }
    if (!this.running) return;

    try {
      await this.resolvePending();
    } catch (err) {
      log.warn(`Resolver cycle error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Schedule next (no overlap)
    void this.scheduleNextCycle(false);
  }

  /**
   * Compute per-signal accuracy and update the WeightLearner for a symbol.
   * Uses signal snapshots to track which signals were individually correct.
   */
  private updateSymbolWeights(symbol: string): void {
    try {
      const accuracy = this.tracker.getAccuracy(symbol, undefined, 30);
      if (accuracy.total < 5) return; // not enough data to learn from

      // Get recent resolved predictions with signal snapshots
      const recentPredictions = this.tracker
        .getRecentPredictions(symbol, 50)
        .filter((p) => p.wasCorrect !== null && p.signalSnapshot !== null);

      if (recentPredictions.length < 3) {
        // Not enough signal snapshot data — fall back to overall accuracy
        const signalAccuracies: Record<string, number> = {};
        for (const key of WEIGHT_KEYS) {
          signalAccuracies[key] = accuracy.overall;
        }
        this.learner.updateWeights(symbol, signalAccuracies);
        return;
      }

      // Compute per-signal accuracy from snapshots
      const signalStats: Record<string, { correct: number; total: number }> = {};
      for (const key of WEIGHT_KEYS) {
        signalStats[key] = { correct: 0, total: 0 };
      }

      for (const pred of recentPredictions) {
        if (!pred.signalSnapshot || pred.actualDirection === null) continue;

        for (const key of WEIGHT_KEYS) {
          const snap = pred.signalSnapshot[key];
          if (!snap || snap.cf === 0) continue; // signal was inactive

          const stat = signalStats[key];
          if (!stat) continue;
          stat.total++;
          // A signal was "correct" if its direction matched the actual outcome
          const signalBullish = snap.direction === 'bullish';
          const actualUp = pred.actualDirection === 'up';
          const signalBearish = snap.direction === 'bearish';
          const actualDown = pred.actualDirection === 'down';

          if ((signalBullish && actualUp) || (signalBearish && actualDown)) {
            stat.correct++;
          }
        }
      }

      // Build per-signal accuracy map
      const signalAccuracies: Record<string, number> = {};
      for (const key of WEIGHT_KEYS) {
        const stats = signalStats[key] ?? { correct: 0, total: 0 };
        signalAccuracies[key] = stats.total >= 3 ? stats.correct / stats.total : 0.5; // uninformative prior for insufficient data
      }

      this.learner.updateWeights(symbol, signalAccuracies);
      log.debug(
        `Updated weights for ${symbol} with per-signal accuracy: ${JSON.stringify(
          Object.fromEntries(
            Object.entries(signalAccuracies).map(([k, v]) => [k, `${(v * 100).toFixed(0)}%`]),
          ),
        )}`,
      );
    } catch (err) {
      log.debug(
        `Weight update failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
