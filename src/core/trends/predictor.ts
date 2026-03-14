// ---------------------------------------------------------------------------
// Multi-signal prediction engine
// ---------------------------------------------------------------------------

import { analyzeTechnicals } from '../technical-analysis/index.js';
import { analyzeSentiment } from './sentiment.js';
import { fetchFearGreedIndex } from '../../data/sources/fear-greed.js';
import {
  fetchFundingRate,
  fetchOpenInterest,
  fetchTickerPrice,
} from '../../data/sources/binance.js';
import { getMLClient } from '../../ml/client.js';
import { buildFeatureVector } from '../../ml/feature-engineer.js';
import type { MLPredictionResult } from '../../ml/types.js';

export interface Prediction {
  symbol: string;
  direction: 'up' | 'down' | 'sideways';
  confidence: number; // 0-100
  timeframe: string;
  reasoning: string[];
  signals: {
    technical: number; // -100 to +100
    sentiment: number;
    derivatives: number;
    trend: number;
    macro: number;
  };
  composite: number; // -100 to +100
  disclaimer: string;
}

// Signal weights (must sum to 100)
const WEIGHTS = {
  technical: 40,
  sentiment: 20,
  derivatives: 20,
  trend: 15,
  macro: 5,
};

/**
 * Generate a multi-signal composite prediction for a symbol.
 * Gathers: technical analysis + sentiment + derivatives + Fear & Greed + price trend.
 */
export async function generatePrediction(symbol: string): Promise<Prediction> {
  const reasoning: string[] = [];
  const signals = { technical: 0, sentiment: 0, derivatives: 0, trend: 0, macro: 0 };
  let completeness = 0;

  // 1. Technical Analysis (weight: 40%)
  try {
    const ta = await analyzeTechnicals(symbol, '4h');
    signals.technical = ta.composite.score;
    completeness++;
    reasoning.push(
      `Technical: ${ta.composite.direction} (score ${ta.composite.score}, confidence ${ta.composite.confidence}%)`,
    );
    for (const sig of ta.signals.slice(0, 3)) {
      reasoning.push(`  - ${sig.description}`);
    }
  } catch {
    reasoning.push('Technical: unavailable');
  }

  // 2. Sentiment (weight: 20%)
  try {
    const sentiment = await analyzeSentiment(symbol);
    // Normalize -1 to +1 → -100 to +100
    signals.sentiment = Math.round(sentiment.overall * 100);
    completeness++;
    reasoning.push(`Sentiment: ${sentiment.consensus} (score ${signals.sentiment})`);
  } catch {
    reasoning.push('Sentiment: unavailable');
  }

  // 3. Derivatives (weight: 20%)
  try {
    const [fundingResult, oiResult] = await Promise.allSettled([
      fetchFundingRate(symbol),
      fetchOpenInterest(symbol),
    ]);

    let derivativeScore = 0;
    if (fundingResult.status === 'fulfilled') {
      const rate = fundingResult.value.fundingRate;
      // Positive funding = longs paying → slightly bullish consensus
      // Extreme positive = overleveraged longs → bearish signal
      if (rate > 0.0005) {
        derivativeScore -= 30; // Overleveraged longs
        reasoning.push(
          `Derivatives: funding rate ${(rate * 100).toFixed(4)}% (overleveraged longs — correction risk)`,
        );
      } else if (rate > 0) {
        derivativeScore += 20;
        reasoning.push(
          `Derivatives: funding rate ${(rate * 100).toFixed(4)}% (moderate bullish positioning)`,
        );
      } else if (rate < -0.0003) {
        derivativeScore += 30; // Capitulation
        reasoning.push(
          `Derivatives: funding rate ${(rate * 100).toFixed(4)}% (capitulation — bounce candidate)`,
        );
      } else {
        derivativeScore -= 20;
        reasoning.push(
          `Derivatives: funding rate ${(rate * 100).toFixed(4)}% (bearish positioning)`,
        );
      }
    }

    if (oiResult.status === 'fulfilled') {
      const notional = oiResult.value.notionalValue;
      reasoning.push(`  OI: $${(notional / 1e9).toFixed(2)}B notional`);
    }

    signals.derivatives = Math.max(-100, Math.min(100, derivativeScore));
    completeness++;
  } catch {
    reasoning.push('Derivatives: unavailable');
  }

  // 4. Price trend (weight: 15%)
  try {
    const price = await fetchTickerPrice(symbol);
    if (price.change24h > 5) {
      signals.trend = 60;
      reasoning.push(`Trend: strong 24h gain +${price.change24h.toFixed(1)}%`);
    } else if (price.change24h > 0) {
      signals.trend = 30;
      reasoning.push(`Trend: positive 24h +${price.change24h.toFixed(1)}%`);
    } else if (price.change24h < -5) {
      signals.trend = -60;
      reasoning.push(`Trend: strong 24h drop ${price.change24h.toFixed(1)}%`);
    } else {
      signals.trend = -30;
      reasoning.push(`Trend: negative 24h ${price.change24h.toFixed(1)}%`);
    }
    completeness++;
  } catch {
    reasoning.push('Trend: unavailable');
  }

  // 5. Macro — Fear & Greed (weight: 5%)
  try {
    const fg = await fetchFearGreedIndex(1);
    const value = fg.current.value;
    // Contrarian: extreme greed = bearish, extreme fear = bullish
    if (value > 80) {
      signals.macro = -40;
      reasoning.push(`Macro: Extreme Greed (${value}) — contrarian bearish`);
    } else if (value > 60) {
      signals.macro = 20;
      reasoning.push(`Macro: Greed (${value}) — bullish sentiment`);
    } else if (value < 20) {
      signals.macro = 40;
      reasoning.push(`Macro: Extreme Fear (${value}) — contrarian bullish`);
    } else if (value < 40) {
      signals.macro = -20;
      reasoning.push(`Macro: Fear (${value}) — bearish sentiment`);
    } else {
      signals.macro = 0;
      reasoning.push(`Macro: Neutral (${value})`);
    }
    completeness++;
  } catch {
    reasoning.push('Macro: unavailable');
  }

  // Composite weighted score
  const composite =
    (signals.technical * WEIGHTS.technical +
      signals.sentiment * WEIGHTS.sentiment +
      signals.derivatives * WEIGHTS.derivatives +
      signals.trend * WEIGHTS.trend +
      signals.macro * WEIGHTS.macro) /
    100;

  // Direction
  const direction: Prediction['direction'] =
    composite > 15 ? 'up' : composite < -15 ? 'down' : 'sideways';

  // Confidence from signal completeness and agreement
  const signalValues = [
    signals.technical,
    signals.sentiment,
    signals.derivatives,
    signals.trend,
    signals.macro,
  ];
  const positiveCount = signalValues.filter((v) => v > 0).length;
  const negativeCount = signalValues.filter((v) => v < 0).length;
  const agreement =
    Math.max(positiveCount, negativeCount) / Math.max(1, positiveCount + negativeCount);
  const confidence = Math.round(Math.min(95, (completeness / 5) * agreement * 100));

  const rulePrediction: Prediction = {
    symbol: symbol.toUpperCase(),
    direction,
    confidence,
    timeframe: '7 days',
    reasoning,
    signals,
    composite: Math.round(composite),
    disclaimer:
      'This is not financial advice. Predictions are based on historical data and AI analysis. Always do your own research.',
  };

  // ML enhancement: if sidecar is available, merge ML prediction
  const mlClient = getMLClient();
  if (mlClient) {
    try {
      const features = await buildFeatureVector(symbol);
      const mlPred = await mlClient.predict(features);
      if (mlPred) {
        return mergePredictions(rulePrediction, mlPred);
      }
    } catch {
      // Fall through to rule-based prediction
    }
  }

  return rulePrediction;
}

function mergePredictions(rule: Prediction, ml: MLPredictionResult): Prediction {
  // Weight: 40% rule-based, 60% ML when both available
  const mlComposite =
    ml.direction === 'up'
      ? ml.probability * 100
      : ml.direction === 'down'
        ? -(ml.probability * 100)
        : 0;

  const mergedComposite = Math.round(rule.composite * 0.4 + mlComposite * 0.6);
  const mergedDirection: Prediction['direction'] =
    mergedComposite > 15 ? 'up' : mergedComposite < -15 ? 'down' : 'sideways';

  const mergedConfidence = Math.round(Math.min(95, rule.confidence * 0.4 + ml.confidence * 0.6));

  return {
    ...rule,
    direction: mergedDirection,
    confidence: mergedConfidence,
    composite: mergedComposite,
    reasoning: [
      ...rule.reasoning,
      `ML (${ml.model}): ${ml.direction} with ${(ml.probability * 100).toFixed(1)}% probability (horizon: ${ml.horizon})`,
    ],
  };
}
