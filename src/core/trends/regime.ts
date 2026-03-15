// ---------------------------------------------------------------------------
// Market regime detection — ML-powered with heuristic fallback
// ---------------------------------------------------------------------------

import { getMLClient } from '../../ml/client.js';
import type { RegimeMLFeatures, MarketRegime } from '../../ml/types.js';

export type { MarketRegime };

export interface RegimeResult {
  regime: MarketRegime;
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
}

/**
 * Detect the current market regime for a symbol.
 * Uses ML regime detector when available, falls back to heuristic.
 */
export async function detectMarketRegime(
  _symbol: string,
  features: RegimeMLFeatures,
): Promise<RegimeResult> {
  const mlClient = getMLClient();
  if (mlClient) {
    try {
      const result = await mlClient.detectRegime(features);
      if (result) {
        return {
          regime: result.regime,
          confidence: result.confidence,
          probabilities: result.probabilities,
          model: result.model,
        };
      }
    } catch {
      // ML unavailable — fallback
    }
  }
  return detectRegimeHeuristic(features);
}

function detectRegimeHeuristic(features: RegimeMLFeatures): RegimeResult {
  const vol = features.volatility_14d;
  const ret7d = features.returns_7d;
  const fg = features.fear_greed;
  const rsi = features.rsi;

  let regime: MarketRegime;
  let confidence: number;

  if (fg < 15 && ret7d < -20) {
    regime = 'capitulation';
    confidence = 80;
  } else if (vol > 8) {
    regime = 'volatile';
    confidence = 70;
  } else if (vol > 5 && ret7d > 10) {
    regime = 'trending_bull';
    confidence = 65;
  } else if (vol > 5 && ret7d < -10) {
    regime = 'trending_bear';
    confidence = 65;
  } else if (ret7d > 5 && rsi > 55) {
    regime = 'trending_bull';
    confidence = 55;
  } else if (ret7d < -5 && rsi < 45) {
    regime = 'trending_bear';
    confidence = 55;
  } else {
    regime = 'ranging';
    confidence = 60;
  }

  const probabilities: Record<string, number> = {
    trending_bull: 0.05,
    trending_bear: 0.05,
    ranging: 0.05,
    volatile: 0.05,
    capitulation: 0.05,
  };
  probabilities[regime] = confidence / 100;
  const remaining = 1.0 - (probabilities[regime] ?? 0);
  const others = Object.keys(probabilities).filter((k) => k !== regime);
  for (const k of others) {
    probabilities[k] = remaining / others.length;
  }

  return {
    regime,
    confidence,
    probabilities,
    model: 'heuristic-regime-detector',
  };
}
