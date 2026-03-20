// ---------------------------------------------------------------------------
// First-Order Logic (FOL) Rule Engine
//
// Evaluates market conditions against a set of axiom-like rules:
//   forall x: condition1(x) AND condition2(x) -> conclusion(x, cf)
//
// Each rule fires if ALL conditions are met, producing a directional
// certainty factor. Multiple fired rules are combined via CF algebra.
// ---------------------------------------------------------------------------

import { combineMultipleCF } from './certainty-factor.js';

// ---------------------------------------------------------------------------
// Market Context — aggregates all available data for rule evaluation
// ---------------------------------------------------------------------------

export interface MarketContext {
  // Technical indicators
  rsi?: number;
  macd?: { histogram: number; signal: number; value: number };
  fundingRate?: number;
  volume24h?: number;
  avgVolume?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  priceVsATH?: number; // ratio: current / ATH (0-1)

  // On-chain / smart money
  smartMoneyFlow?: 'buying' | 'selling' | 'neutral';
  whaleActivity?: 'accumulating' | 'distributing' | 'neutral';

  // Sentiment
  fearGreedIndex?: number; // 0-100
  sentimentScore?: number; // -1 to 1
  newsCount?: number;

  // Derivatives
  openInterest?: number;
  longShortRatio?: number;

  // ML signals
  mlDirection?: 'up' | 'down' | 'sideways';
  mlConfidence?: number; // 0-100

  // Prediction markets
  predictionMarketProbability?: number; // 0-1
}

// ---------------------------------------------------------------------------
// Rule definition
// ---------------------------------------------------------------------------

export interface FOLRule {
  name: string;
  description: string;
  conditions: ((ctx: MarketContext) => boolean)[];
  conclusion: {
    direction: 'bullish' | 'bearish';
    cf: number; // certainty factor if rule fires [0, 1]
  };
}

// ---------------------------------------------------------------------------
// Default rule set — based on quantitative trading axioms
// ---------------------------------------------------------------------------

export const DEFAULT_RULES: FOLRule[] = [
  // --- Bearish rules ---
  {
    name: 'overbought_overleveraged',
    description: 'RSI overbought AND high positive funding rate -> bearish',
    conditions: [
      (ctx) => ctx.rsi !== undefined && ctx.rsi > 70,
      (ctx) => ctx.fundingRate !== undefined && ctx.fundingRate > 0.0005,
    ],
    conclusion: { direction: 'bearish', cf: 0.6 },
  },
  {
    name: 'whale_distribution_ath',
    description: 'Whales distributing AND price near ATH -> bearish',
    conditions: [
      (ctx) => ctx.whaleActivity === 'distributing',
      (ctx) => ctx.priceVsATH !== undefined && ctx.priceVsATH > 0.9,
    ],
    conclusion: { direction: 'bearish', cf: 0.65 },
  },
  {
    name: 'extreme_greed_reversal',
    description: 'Extreme greed AND negative on-chain flow -> bearish (contrarian)',
    conditions: [
      (ctx) => ctx.fearGreedIndex !== undefined && ctx.fearGreedIndex > 80,
      (ctx) => ctx.smartMoneyFlow === 'selling',
    ],
    conclusion: { direction: 'bearish', cf: 0.55 },
  },
  {
    name: 'macd_bearish_declining_volume',
    description: 'MACD bearish crossover AND declining volume -> bearish',
    conditions: [
      (ctx) => ctx.macd !== undefined && ctx.macd.histogram < 0 && ctx.macd.value < ctx.macd.signal,
      (ctx) =>
        ctx.volume24h !== undefined &&
        ctx.avgVolume !== undefined &&
        ctx.avgVolume > 0 &&
        ctx.volume24h < ctx.avgVolume * 0.8,
    ],
    conclusion: { direction: 'bearish', cf: 0.5 },
  },
  {
    name: 'distribution_above_200ma',
    description: 'Price well above long-term average AND distribution -> bearish (long-term)',
    conditions: [
      (ctx) => ctx.priceChange7d !== undefined && ctx.priceChange7d > 15,
      (ctx) => ctx.whaleActivity === 'distributing' || ctx.smartMoneyFlow === 'selling',
    ],
    conclusion: { direction: 'bearish', cf: 0.45 },
  },

  // --- Bullish rules ---
  {
    name: 'oversold_capitulation',
    description: 'RSI oversold AND negative funding rate -> bullish',
    conditions: [
      (ctx) => ctx.rsi !== undefined && ctx.rsi < 30,
      (ctx) => ctx.fundingRate !== undefined && ctx.fundingRate < -0.0003,
    ],
    conclusion: { direction: 'bullish', cf: 0.6 },
  },
  {
    name: 'smart_money_accumulation_volume',
    description: 'Smart money buying AND volume spike -> bullish',
    conditions: [
      (ctx) => ctx.smartMoneyFlow === 'buying',
      (ctx) =>
        ctx.volume24h !== undefined &&
        ctx.avgVolume !== undefined &&
        ctx.avgVolume > 0 &&
        ctx.volume24h > ctx.avgVolume * 2,
    ],
    conclusion: { direction: 'bullish', cf: 0.7 },
  },
  {
    name: 'extreme_fear_positive_onchain',
    description: 'Extreme fear AND positive on-chain flow -> bullish (contrarian)',
    conditions: [
      (ctx) => ctx.fearGreedIndex !== undefined && ctx.fearGreedIndex < 20,
      (ctx) => ctx.smartMoneyFlow === 'buying',
    ],
    conclusion: { direction: 'bullish', cf: 0.55 },
  },
  {
    name: 'macd_bullish_volume_surge',
    description: 'MACD bullish crossover AND volume above average -> bullish',
    conditions: [
      (ctx) => ctx.macd !== undefined && ctx.macd.histogram > 0 && ctx.macd.value > ctx.macd.signal,
      (ctx) =>
        ctx.volume24h !== undefined &&
        ctx.avgVolume !== undefined &&
        ctx.avgVolume > 0 &&
        ctx.volume24h > ctx.avgVolume,
    ],
    conclusion: { direction: 'bullish', cf: 0.5 },
  },
  {
    name: 'accumulation_deep_value',
    description: 'Strong dip AND accumulation -> bullish (long-term value)',
    conditions: [
      (ctx) => ctx.priceChange7d !== undefined && ctx.priceChange7d < -15,
      (ctx) => ctx.whaleActivity === 'accumulating' || ctx.smartMoneyFlow === 'buying',
    ],
    conclusion: { direction: 'bullish', cf: 0.45 },
  },

  // --- Cross-signal confirmation rules ---
  {
    name: 'ml_technical_alignment_bullish',
    description: 'ML predicts up with high confidence AND RSI not overbought -> bullish',
    conditions: [
      (ctx) => ctx.mlDirection === 'up' && ctx.mlConfidence !== undefined && ctx.mlConfidence > 70,
      (ctx) => ctx.rsi === undefined || ctx.rsi < 70,
    ],
    conclusion: { direction: 'bullish', cf: 0.55 },
  },
  {
    name: 'ml_technical_alignment_bearish',
    description: 'ML predicts down with high confidence AND RSI not oversold -> bearish',
    conditions: [
      (ctx) =>
        ctx.mlDirection === 'down' && ctx.mlConfidence !== undefined && ctx.mlConfidence > 70,
      (ctx) => ctx.rsi === undefined || ctx.rsi > 30,
    ],
    conclusion: { direction: 'bearish', cf: 0.55 },
  },
  {
    name: 'prediction_market_bullish',
    description: 'Prediction markets strongly bullish AND positive sentiment -> bullish',
    conditions: [
      (ctx) =>
        ctx.predictionMarketProbability !== undefined && ctx.predictionMarketProbability > 0.65,
      (ctx) => ctx.sentimentScore !== undefined && ctx.sentimentScore > 0,
    ],
    conclusion: { direction: 'bullish', cf: 0.5 },
  },
  {
    name: 'prediction_market_bearish',
    description: 'Prediction markets strongly bearish AND negative sentiment -> bearish',
    conditions: [
      (ctx) =>
        ctx.predictionMarketProbability !== undefined && ctx.predictionMarketProbability < 0.35,
      (ctx) => ctx.sentimentScore !== undefined && ctx.sentimentScore < 0,
    ],
    conclusion: { direction: 'bearish', cf: 0.5 },
  },
];

// ---------------------------------------------------------------------------
// Rule evaluation engine
// ---------------------------------------------------------------------------

export interface RuleEvaluationResult {
  direction: 'bullish' | 'bearish' | 'neutral';
  cf: number; // combined CF from all fired rules [-1, 1]
  firedRules: { name: string; direction: string; cf: number }[];
  totalRulesEvaluated: number;
}

/**
 * Evaluate all FOL rules against the current market context.
 *
 * 1. Each rule whose conditions ALL evaluate to true "fires"
 * 2. Fired rules produce signed CFs: bullish = +cf, bearish = -cf
 * 3. All fired CFs are combined via CF algebra (combineMultipleCF)
 * 4. Final direction is derived from the combined CF sign
 *
 * @param ctx Current market context with available data
 * @param rules Rule set to evaluate (defaults to DEFAULT_RULES)
 * @returns Combined direction and certainty factor
 */
export function evaluateRules(
  ctx: MarketContext,
  rules: FOLRule[] = DEFAULT_RULES,
): RuleEvaluationResult {
  const firedRules: RuleEvaluationResult['firedRules'] = [];
  const firedCFs: number[] = [];

  for (const rule of rules) {
    // A rule fires only if ALL conditions are true (conjunction)
    const allConditionsMet = rule.conditions.every((condition) => {
      try {
        return condition(ctx);
      } catch {
        return false; // defensive: broken condition = not met
      }
    });

    if (allConditionsMet) {
      // Sign the CF based on direction
      const signedCF =
        rule.conclusion.direction === 'bullish' ? rule.conclusion.cf : -rule.conclusion.cf;

      firedCFs.push(signedCF);
      firedRules.push({
        name: rule.name,
        direction: rule.conclusion.direction,
        cf: rule.conclusion.cf,
      });
    }
  }

  // Combine all fired CFs via CF algebra
  const combinedCF = combineMultipleCF(firedCFs);

  // Derive direction from combined CF
  const direction: RuleEvaluationResult['direction'] =
    combinedCF > 0.05 ? 'bullish' : combinedCF < -0.05 ? 'bearish' : 'neutral';

  return {
    direction,
    cf: combinedCF,
    firedRules,
    totalRulesEvaluated: rules.length,
  };
}
