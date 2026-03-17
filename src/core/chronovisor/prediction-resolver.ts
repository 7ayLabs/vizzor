// ---------------------------------------------------------------------------
// PredictionResolver — automatic feedback loop for ChronoVisor predictions
// Periodically resolves expired predictions by comparing initial vs current
// price, then updates WeightLearner for Bayesian weight adaptation.
// ---------------------------------------------------------------------------

import type { PredictionRecord, WeightConfig } from './types.js';
import type { AccuracyTracker } from './accuracy-tracker.js';
import type { WeightLearner } from './weight-learner.js';
import { createLogger } from '../../utils/logger.js';
import { emitNotification } from '../../notifications/event-bus.js';

const log = createLogger('chronovisor:resolver');

/** Maps horizon strings to their duration in seconds. */
const HORIZON_SECONDS: Record<string, number> = {
  '1h': 3600,
  '4h': 14_400,
  '1d': 86_400,
  '7d': 604_800,
};

/** Minimum price change % to classify as up/down (avoid noise). */
const SIDEWAYS_THRESHOLD = 0.3;

/** Default resolve cycle interval: 15 minutes. */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/** Weight keys for signal accuracy tracking. */
const WEIGHT_KEYS: (keyof WeightConfig)[] = [
  'onChain',
  'mlEnsemble',
  'predictionMarkets',
  'socialNarrative',
  'patternMatch',
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
  private readonly intervalMs: number;

  /**
   * @param tracker  AccuracyTracker instance (from ChronoVisorEngine)
   * @param learner  WeightLearner instance (from ChronoVisorEngine)
   * @param intervalMs  How often to run the resolve cycle (default 15 min)
   */
  constructor(tracker: AccuracyTracker, learner: WeightLearner, intervalMs = DEFAULT_INTERVAL_MS) {
    this.tracker = tracker;
    this.learner = learner;
    this.intervalMs = Math.max(60_000, intervalMs); // minimum 1 minute
  }

  // -------------------------------------------------------------------------
  // Lifecycle (follows AgentEngine setTimeout-chain pattern)
  // -------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stats.isRunning = true;
    log.info(`PredictionResolver started (interval: ${this.intervalMs / 1000}s)`);
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

        let actualDirection: 'up' | 'down' | 'sideways';
        if (changePct > SIDEWAYS_THRESHOLD) {
          actualDirection = 'up';
        } else if (changePct < -SIDEWAYS_THRESHOLD) {
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

  private async scheduleNextCycle(immediate: boolean): Promise<void> {
    if (!immediate) {
      await new Promise<void>((resolve) => {
        this.timer = setTimeout(resolve, this.intervalMs);
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
   * Uses the last 30 days of resolved predictions.
   */
  private updateSymbolWeights(symbol: string): void {
    try {
      const accuracy = this.tracker.getAccuracy(symbol, undefined, 30);
      if (accuracy.total < 5) return; // not enough data to learn from

      // For now, we use overall accuracy for all signal keys since we don't
      // track per-signal correctness. A future improvement would be to track
      // which signals contributed most to correct vs incorrect predictions.
      const signalAccuracies: Record<string, number> = {};
      for (const key of WEIGHT_KEYS) {
        signalAccuracies[key] = accuracy.overall;
      }

      this.learner.updateWeights(symbol, signalAccuracies);
      log.debug(
        `Updated weights for ${symbol}: accuracy=${(accuracy.overall * 100).toFixed(1)}% (${accuracy.correct}/${accuracy.total})`,
      );
    } catch (err) {
      log.debug(
        `Weight update failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
