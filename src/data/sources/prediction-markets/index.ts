// ---------------------------------------------------------------------------
// Prediction market adapter registry — aggregates signals from all adapters
// ---------------------------------------------------------------------------

import type { PredictionMarketAdapter, PredictionMarketSignal } from './types.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('prediction-markets');

/** Singleton adapter registry. */
const adapters: PredictionMarketAdapter[] = [];

/**
 * Register a new prediction market adapter.
 * Duplicate platforms are silently ignored.
 */
export function registerPredictionMarketAdapter(adapter: PredictionMarketAdapter): void {
  const exists = adapters.some((a) => a.platform === adapter.platform);
  if (exists) {
    log.warn(`Prediction market adapter "${adapter.platform}" already registered — skipping`);
    return;
  }
  adapters.push(adapter);
  log.info(`Registered prediction market adapter: ${adapter.platform}`);
}

/** Returns all registered prediction market adapters. */
export function getPredictionMarketAdapters(): PredictionMarketAdapter[] {
  return [...adapters];
}

/**
 * Fetch signals from all registered prediction market adapters, optionally
 * filtered by category. Deduplicates by marketId (first adapter wins).
 */
export async function fetchAllPredictionMarketSignals(
  category?: string,
): Promise<PredictionMarketSignal[]> {
  if (adapters.length === 0) {
    log.debug('No prediction market adapters registered');
    return [];
  }

  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter.fetchActiveMarkets(category)),
  );

  const seen = new Set<string>();
  const signals: PredictionMarketSignal[] = [];

  for (const result of results) {
    if (result.status !== 'fulfilled') {
      log.debug(`Prediction market adapter failed: ${result.reason}`);
      continue;
    }

    for (const signal of result.value) {
      if (!seen.has(signal.marketId)) {
        seen.add(signal.marketId);
        signals.push(signal);
      }
    }
  }

  log.debug(`Fetched ${signals.length} prediction market signals from ${adapters.length} adapters`);
  return signals;
}

// Re-export types for convenience
export type { PredictionMarketAdapter, PredictionMarketSignal } from './types.js';
export type { MarketCategory } from './types.js';
