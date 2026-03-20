// ---------------------------------------------------------------------------
// ChronoVisor engine — weighted ensemble orchestrator
// v2: CF algebra + Bayesian updates + FOL rules + meta-reasoning
// ---------------------------------------------------------------------------

import type {
  ChronoVisorResult,
  PredictionHorizon,
  WeightConfig,
  SignalBreakdown,
  CompositeScore,
  SignalCategory,
  SignalSnapshot,
} from './types.js';
import { WeightLearner } from './weight-learner.js';
import { AccuracyTracker } from './accuracy-tracker.js';
import { PatternLibrary } from './pattern-library.js';
import { PredictionResolver } from './prediction-resolver.js';
import { fetchAllPredictionMarketSignals } from '../../data/sources/prediction-markets/index.js';
import { getMLClient } from '../../ml/client.js';
import { createLogger } from '../../utils/logger.js';

// Math foundations
import { combineMultipleCF, weightedCF } from './math/certainty-factor.js';
import { clampProbability, cfToProbability } from './math/probability.js';
import { sequentialBayesianUpdate, buildEvidencePairs } from './math/bayesian.js';
import { evaluateRules, type MarketContext } from './math/fol-rules.js';
import {
  computeMetaConfidence,
  computeSignalCompleteness,
  computeSignalAgreement,
} from './math/meta-reasoning.js';

// Lazy imports to avoid circular dependency issues
const lazySentiment = () =>
  import('../../core/trends/sentiment.js').then((m) => m.analyzeSentiment);
const lazyBinance = () =>
  import('../../data/sources/binance.js').then((m) => ({
    fetchFundingRate: m.fetchFundingRate,
    fetchOpenInterest: m.fetchOpenInterest,
  }));
const lazyFeatureEngineer = () =>
  import('../../ml/feature-engineer.js').then((m) => m.buildFeatureVector);
const lazyBinancePrice = () =>
  import('../../data/sources/binance.js').then((m) => m.fetchTickerPrice);
const log = createLogger('chronovisor');

const DEFAULT_WEIGHTS: WeightConfig = {
  onChain: 0.25,
  mlEnsemble: 0.2,
  predictionMarkets: 0.15,
  socialNarrative: 0.1,
  patternMatch: 0.05,
  logicRules: 0.15,
};

const DEFAULT_HORIZONS: PredictionHorizon[] = ['1h', '4h', '1d', '7d'];

/** Weight keys for iterating. */
const SIGNAL_KEYS: (keyof WeightConfig)[] = [
  'onChain',
  'mlEnsemble',
  'predictionMarkets',
  'socialNarrative',
  'patternMatch',
  'logicRules',
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class ChronoVisorEngine {
  private readonly weightLearner: WeightLearner;
  private readonly accuracyTracker: AccuracyTracker;
  private readonly patternLibrary: PatternLibrary;
  private readonly predictionResolver: PredictionResolver;

  constructor() {
    this.weightLearner = new WeightLearner();
    this.accuracyTracker = new AccuracyTracker();
    this.patternLibrary = new PatternLibrary();
    this.predictionResolver = new PredictionResolver(
      this.accuracyTracker,
      this.weightLearner,
      this.patternLibrary,
    );
    this.predictionResolver.start();
    log.info('ChronoVisor engine v2 initialized (CF algebra + Bayesian + FOL + meta-reasoning)');
  }

  // -----------------------------------------------------------------------
  // Accessors for sub-components
  // -----------------------------------------------------------------------

  getWeightLearner(): WeightLearner {
    return this.weightLearner;
  }

  getAccuracyTracker(): AccuracyTracker {
    return this.accuracyTracker;
  }

  getPatternLibrary(): PatternLibrary {
    return this.patternLibrary;
  }

  getPredictionResolver(): PredictionResolver {
    return this.predictionResolver;
  }

  // -----------------------------------------------------------------------
  // Main prediction pipeline
  // -----------------------------------------------------------------------

  /**
   * Run the full ChronoVisor prediction pipeline for a symbol.
   *
   * 1. Gather signals from all 6 categories in parallel
   * 2. Get learned weights (or use defaults)
   * 3. Compute composite via CF algebra + Bayesian + meta-reasoning
   * 4. Generate predictions per horizon
   * 5. Save signal snapshot for per-signal accuracy tracking
   * 6. Return full ChronoVisorResult
   */
  async predict(symbol: string, horizons?: PredictionHorizon[]): Promise<ChronoVisorResult> {
    const activeHorizons = horizons ?? DEFAULT_HORIZONS;
    const normalizedSymbol = symbol.toUpperCase();
    log.info(`Predicting ${normalizedSymbol} for horizons: ${activeHorizons.join(', ')}`);

    // 1. Gather all signals in parallel (graceful on failure)
    const [onChain, mlEnsemble, predictionMarkets, socialNarrative, patternMatch] =
      await Promise.allSettled([
        this.gatherOnChainSignals(normalizedSymbol),
        this.gatherMLSignals(normalizedSymbol),
        this.gatherPredictionMarketSignals(normalizedSymbol),
        this.gatherSocialSignals(normalizedSymbol),
        this.gatherPatternSignals(normalizedSymbol),
      ]);

    const signals: SignalBreakdown = {
      onChain: this.extractSignal(onChain, 'onChain'),
      mlEnsemble: this.extractSignal(mlEnsemble, 'mlEnsemble'),
      predictionMarkets: this.extractSignal(predictionMarkets, 'predictionMarkets'),
      socialNarrative: this.extractSignal(socialNarrative, 'socialNarrative'),
      patternMatch: this.extractSignal(patternMatch, 'patternMatch'),
      logicRules: {
        name: 'logicRules',
        weight: DEFAULT_WEIGHTS.logicRules,
        score: 0,
        confidence: 0,
        sources: [],
      },
    };

    // 1b. Evaluate FOL logic rules using gathered signal data as context
    const marketCtx = this.buildMarketContext(signals);
    const ruleResult = evaluateRules(marketCtx);
    signals.logicRules = {
      name: 'logicRules',
      weight: DEFAULT_WEIGHTS.logicRules,
      score: ruleResult.cf,
      confidence:
        ruleResult.firedRules.length > 0 ? Math.min(1, ruleResult.firedRules.length * 0.2) : 0,
      sources: ruleResult.firedRules.map(
        (r) => `rule:${r.name}(${r.direction}, cf=${r.cf.toFixed(2)})`,
      ),
    };

    // 2. Get learned weights
    const weights = this.weightLearner.getWeights(normalizedSymbol);
    this.applyWeights(signals, weights);

    // 3. Compute composite via CF algebra + Bayesian + meta-reasoning
    const composite = this.computeComposite(signals, weights, normalizedSymbol);

    // 4. Generate predictions per horizon
    const predictions = activeHorizons.map((horizon) =>
      this.generateHorizonPrediction(normalizedSymbol, horizon, composite, signals),
    );

    // 5. Build signal snapshot for per-signal accuracy tracking
    const signalSnapshot = this.buildSignalSnapshot(signals);

    // 6. Fetch current price for accuracy tracking
    let initialPrice = 0;
    try {
      const fetchPrice = await lazyBinancePrice();
      const ticker = await fetchPrice(normalizedSymbol);
      initialPrice = ticker.price;
    } catch {
      log.debug(
        `Could not fetch initial price for ${normalizedSymbol} — accuracy tracking degraded`,
      );
    }

    // 7. Log each prediction with signal snapshot
    const now = Math.floor(Date.now() / 1000);
    for (const pred of predictions) {
      const id = `${normalizedSymbol}_${pred.horizon}_${now}`;
      this.accuracyTracker.logPrediction({
        id,
        symbol: normalizedSymbol,
        horizon: pred.horizon,
        predictedDirection: pred.direction,
        probability: pred.probability,
        compositeScore: composite.score,
        initialPrice,
        createdAt: now,
        signalSnapshot,
      });
    }

    // 8. Fetch historical accuracy
    const rawAccuracy = this.accuracyTracker.getAccuracy(normalizedSymbol);
    const accuracy =
      rawAccuracy.total > 0
        ? { overall: rawAccuracy.overall, byHorizon: rawAccuracy.byHorizon }
        : null;

    const result: ChronoVisorResult = {
      symbol: normalizedSymbol,
      composite,
      predictions,
      accuracy,
      generatedAt: Date.now(),
    };

    log.info(
      `${normalizedSymbol} composite: ${composite.score.toFixed(3)} (${composite.direction}, confidence ${composite.confidence.toFixed(0)}%) [CF algebra + Bayesian]`,
    );

    return result;
  }

  // -----------------------------------------------------------------------
  // Signal gatherers
  // -----------------------------------------------------------------------

  async gatherOnChainSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;
    let signalCount = 0;

    try {
      const binance = await lazyBinance();

      const [fundingResult, oiResult] = await Promise.allSettled([
        binance.fetchFundingRate(symbol),
        binance.fetchOpenInterest(symbol),
      ]);

      if (fundingResult.status === 'fulfilled') {
        const rate = fundingResult.value.fundingRate;
        if (rate > 0.0005) {
          score -= 0.4;
          sources.push(`funding_rate_bearish(${(rate * 100).toFixed(4)}%)`);
        } else if (rate < -0.0003) {
          score += 0.4;
          sources.push(`funding_rate_bullish(${(rate * 100).toFixed(4)}%)`);
        } else {
          score += rate > 0 ? 0.1 : -0.1;
          sources.push(`funding_rate_neutral(${(rate * 100).toFixed(4)}%)`);
        }
        signalCount++;
      }

      if (oiResult.status === 'fulfilled') {
        const notional = oiResult.value.notionalValue;
        sources.push(`open_interest($${(notional / 1e6).toFixed(1)}M)`);
        signalCount++;
      }

      confidence = signalCount > 0 ? Math.min(1, signalCount * 0.4) : 0;
    } catch (err) {
      log.debug(
        `On-chain signals failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      name: 'onChain',
      weight: DEFAULT_WEIGHTS.onChain,
      score: Math.max(-1, Math.min(1, score)),
      confidence,
      sources,
    };
  }

  async gatherMLSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;

    const mlClient = getMLClient();
    if (!mlClient) {
      return {
        name: 'mlEnsemble',
        weight: DEFAULT_WEIGHTS.mlEnsemble,
        score: 0,
        confidence: 0,
        sources: ['ml_unavailable'],
      };
    }

    try {
      const buildFeatureVector = await lazyFeatureEngineer();
      const features = await buildFeatureVector(symbol);
      const prediction = await mlClient.predict(features);

      if (prediction) {
        if (prediction.direction === 'up') {
          score = prediction.probability;
        } else if (prediction.direction === 'down') {
          score = -prediction.probability;
        } else {
          score = 0;
        }
        confidence = prediction.confidence / 100;
        sources.push(
          `ml_${prediction.model}(${prediction.direction}, p=${prediction.probability.toFixed(2)})`,
        );
      }
    } catch (err) {
      log.debug(
        `ML signals failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      sources.push('ml_error');
    }

    return {
      name: 'mlEnsemble',
      weight: DEFAULT_WEIGHTS.mlEnsemble,
      score: Math.max(-1, Math.min(1, score)),
      confidence,
      sources,
    };
  }

  async gatherPredictionMarketSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;

    try {
      const signals = await fetchAllPredictionMarketSignals('crypto_price');

      const relevant = signals.filter((s) =>
        s.relatedTokens.some((t) => t.toUpperCase() === symbol.toUpperCase()),
      );

      if (relevant.length > 0) {
        let totalProbability = 0;
        let totalMomentum = 0;

        for (const sig of relevant) {
          totalProbability += sig.probability;
          totalMomentum += sig.momentumScore;
          sources.push(`${sig.platform}:${sig.marketId}(p=${sig.probability.toFixed(2)})`);
        }

        const avgProbability = totalProbability / relevant.length;
        const avgMomentum = totalMomentum / relevant.length;

        score = (avgProbability - 0.5) * 2;
        score += avgMomentum * 0.3;
        score = Math.max(-1, Math.min(1, score));

        const totalVolume = relevant.reduce((sum, s) => sum + s.volume, 0);
        confidence = Math.min(1, relevant.length * 0.2 + (totalVolume > 100000 ? 0.3 : 0));
      } else {
        sources.push('no_relevant_markets');
      }
    } catch (err) {
      log.debug(
        `Prediction market signals failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      sources.push('prediction_markets_error');
    }

    return {
      name: 'predictionMarkets',
      weight: DEFAULT_WEIGHTS.predictionMarkets,
      score,
      confidence,
      sources,
    };
  }

  async gatherSocialSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;

    try {
      const analyzeSentiment = await lazySentiment();
      const sentiment = await analyzeSentiment(symbol);

      score = sentiment.overall;
      confidence = sentiment.sources.length > 0 ? Math.min(1, sentiment.sources.length * 0.3) : 0;

      for (const src of sentiment.sources) {
        sources.push(`${src.source}(score=${src.score.toFixed(2)})`);
      }

      sources.push(`consensus:${sentiment.consensus}`);
    } catch (err) {
      log.debug(
        `Social signals failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      sources.push('social_error');
    }

    return {
      name: 'socialNarrative',
      weight: DEFAULT_WEIGHTS.socialNarrative,
      score: Math.max(-1, Math.min(1, score)),
      confidence,
      sources,
    };
  }

  async gatherPatternSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;

    try {
      let features: number[] | null = null;

      const mlClient = getMLClient();
      if (mlClient) {
        try {
          const buildFeatureVector = await lazyFeatureEngineer();
          const fv = await buildFeatureVector(symbol);
          features = [
            fv.rsi,
            fv.macdHistogram,
            fv.bollingerPercentB,
            fv.atr,
            fv.obv,
            fv.fundingRate,
            fv.fearGreed,
            fv.priceChange24h,
            fv.rsiSlope,
            fv.volumeRatio,
            fv.emaCrossoverPct,
            fv.atrPct,
          ];
        } catch {
          // Feature vector unavailable
        }
      }

      if (features) {
        const matches = this.patternLibrary.findSimilarPatterns(features, 5);

        if (matches.length > 0) {
          let totalWeight = 0;
          let weightedScore = 0;

          for (const match of matches) {
            const w = match.similarity;
            const directionScore = match.outcome === 'up' ? 1 : match.outcome === 'down' ? -1 : 0;
            weightedScore += directionScore * w * (match.profitPct > 0 ? 1 : 0.5);
            totalWeight += w;
            sources.push(
              `pattern:${match.name}(sim=${match.similarity.toFixed(2)}, ${match.outcome}, ${match.profitPct.toFixed(1)}%)`,
            );
          }

          score = totalWeight > 0 ? weightedScore / totalWeight : 0;
          score = Math.max(-1, Math.min(1, score));

          const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;
          confidence = Math.min(1, avgSimilarity * matches.length * 0.15);
        } else {
          sources.push('no_matching_patterns');
        }
      } else {
        sources.push('features_unavailable');
      }
    } catch (err) {
      log.debug(
        `Pattern signals failed for ${symbol}: ${err instanceof Error ? err.message : String(err)}`,
      );
      sources.push('pattern_error');
    }

    return {
      name: 'patternMatch',
      weight: DEFAULT_WEIGHTS.patternMatch,
      score,
      confidence,
      sources,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private extractSignal(
    result: PromiseSettledResult<SignalCategory>,
    name: string,
  ): SignalCategory {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    log.warn(`Signal ${name} failed: ${result.reason}`);
    return {
      name,
      weight: DEFAULT_WEIGHTS[name as keyof WeightConfig] ?? 0.1,
      score: 0,
      confidence: 0,
      sources: ['error'],
    };
  }

  private applyWeights(signals: SignalBreakdown, weights: WeightConfig): void {
    for (const key of SIGNAL_KEYS) {
      if (signals[key]) {
        signals[key].weight = weights[key];
      }
    }
  }

  /**
   * Build a MarketContext from available signal data for FOL rule evaluation.
   */
  private buildMarketContext(signals: SignalBreakdown): MarketContext {
    const ctx: MarketContext = {};

    // Extract data from on-chain signal sources
    for (const src of signals.onChain.sources) {
      const fundingMatch = src.match(/funding_rate_\w+\(([^)]+)%\)/);
      if (fundingMatch) {
        ctx.fundingRate = parseFloat(fundingMatch[1] ?? '0') / 100;
      }
    }

    // ML signal direction + confidence
    for (const src of signals.mlEnsemble.sources) {
      if (src.includes('(up,')) {
        ctx.mlDirection = 'up';
      } else if (src.includes('(down,')) {
        ctx.mlDirection = 'down';
      } else if (src.includes('(sideways,')) {
        ctx.mlDirection = 'sideways';
      }
    }
    if (signals.mlEnsemble.confidence > 0) {
      ctx.mlConfidence = signals.mlEnsemble.confidence * 100;
    }

    // Prediction market probability
    if (signals.predictionMarkets.confidence > 0) {
      ctx.predictionMarketProbability = (signals.predictionMarkets.score + 1) / 2;
    }

    // Sentiment score
    if (signals.socialNarrative.confidence > 0) {
      ctx.sentimentScore = signals.socialNarrative.score;
    }

    return ctx;
  }

  /**
   * Compute composite score using mathematical foundations:
   *
   * 1. Weight each signal's CF by its learned weight
   * 2. Combine non-zero CFs via CF algebra (ignores dead signals)
   * 3. Determine dominant direction from weighted signals
   * 4. Run Bayesian updates: prior=0.5, each signal is evidence
   * 5. Apply meta-reasoning modifier (penalizes incomplete/conflicting data)
   * 6. Enforce Kolmogorov axioms: P in [0, 1]
   */
  private computeComposite(
    signals: SignalBreakdown,
    _weights: WeightConfig,
    symbol: string,
  ): CompositeScore {
    const categories: SignalCategory[] = SIGNAL_KEYS.map((key) => signals[key]);

    // Step 1: Weight each signal's confidence as a CF [-1, 1]
    // CF = score * confidence (0 confidence → 0 CF → ignored by CF algebra)
    const signalCFs: number[] = [];
    const signalDirections: { cf: number; name: string }[] = [];

    for (const cat of categories) {
      const cf = weightedCF(cat.score, cat.confidence);
      signalCFs.push(cf);
      signalDirections.push({ cf, name: cat.name });
    }

    // Step 2: Combine via CF algebra (dead signals with CF=0 are automatically ignored)
    const combinedCF = combineMultipleCF(signalCFs);

    // Step 3: Determine dominant direction
    const direction: CompositeScore['direction'] =
      combinedCF > 0.05 ? 'bullish' : combinedCF < -0.05 ? 'bearish' : 'neutral';

    // Step 4: Bayesian probability update
    // Hypothesis: "price moves in the direction indicated by combinedCF"
    const isBullish = combinedCF >= 0;
    const activeSignals = signalCFs.filter((cf) => cf !== 0);

    let probability: number;
    if (activeSignals.length === 0) {
      probability = 0.5; // uninformative prior — no evidence
    } else {
      // Build evidence pairs from signals
      const bayesSignals = signalDirections
        .filter((s) => s.cf !== 0)
        .map((s) => ({
          cf: Math.abs(s.cf),
          agrees: isBullish ? s.cf > 0 : s.cf < 0,
        }));

      const evidencePairs = buildEvidencePairs(bayesSignals, 0.5);
      probability = sequentialBayesianUpdate(0.5, evidencePairs);
    }

    // Step 5: Meta-reasoning confidence modifier
    const completeness = computeSignalCompleteness(signalCFs);
    const agreement = computeSignalAgreement(signalCFs);

    // Get historical reliability from accuracy tracker
    const rawAccuracy = this.accuracyTracker.getAccuracy(symbol, undefined, 30);
    const historicalReliability = rawAccuracy.total >= 5 ? rawAccuracy.overall : 0;

    // Estimate regime volatility from signal disagreement
    const regimeVolatility = 1 - agreement;

    const metaModifier = computeMetaConfidence({
      signalCompleteness: completeness,
      signalAgreement: agreement,
      historicalReliability,
      regimeVolatility,
    });

    // Step 6: Apply meta-modifier and enforce Kolmogorov axioms
    // Scale probability away from 0.5 by meta-modifier
    const adjustedProbability = 0.5 + (probability - 0.5) * metaModifier;
    const finalProbability = clampProbability(adjustedProbability);

    // Confidence as percentage: how far from 0.5 (uninformative)
    const confidence = Math.min(100, Math.abs(finalProbability - 0.5) * 200);

    log.debug(
      `CF algebra: combined=${combinedCF.toFixed(3)}, active=${activeSignals.length}/${signalCFs.length}, ` +
        `bayesian=${probability.toFixed(3)}, meta=${metaModifier.toFixed(2)}, final=${finalProbability.toFixed(3)}, ` +
        `confidence=${confidence.toFixed(1)}%`,
    );

    return {
      score: Math.max(-1, Math.min(1, combinedCF)),
      direction,
      confidence,
      signalBreakdown: signals,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate a single horizon prediction from the composite score.
   * Uses CF-to-probability mapping with horizon uncertainty decay.
   */
  private generateHorizonPrediction(
    _symbol: string,
    horizon: PredictionHorizon,
    composite: CompositeScore,
    signals: SignalBreakdown,
  ): ChronoVisorResult['predictions'][number] {
    const horizonMultiplier: Record<string, number> = {
      '5m': 1.0,
      '15m': 1.0,
      '30m': 0.95,
      '1h': 0.9,
      '4h': 0.85,
      '1d': 0.7,
      '7d': 0.5,
    };

    const multiplier = horizonMultiplier[horizon] ?? 0.5;

    // Convert composite CF to probability, then apply horizon decay
    const baseProbability = cfToProbability(composite.score);
    // Scale away from 0.5 by multiplier
    const adjustedProbability = 0.5 + (baseProbability - 0.5) * multiplier;

    // Apply meta-confidence (already embedded in composite.confidence)
    const metaScale = composite.confidence / 100;
    const finalProbability = clampProbability(
      0.5 + (adjustedProbability - 0.5) * Math.max(0.3, metaScale),
    );

    const direction: 'up' | 'down' | 'sideways' =
      finalProbability > 0.55 ? 'up' : finalProbability < 0.45 ? 'down' : 'sideways';

    // Probability is distance from 0.5, scaled to 0-1
    const probability = clampProbability(
      Math.max(0.05, Math.min(0.95, Math.abs(finalProbability - 0.5) * 2)),
    );

    // Build reasoning
    const reasoning: string[] = [];
    const allCategories = SIGNAL_KEYS.map((key) => signals[key]);

    for (const cat of allCategories) {
      if (cat.sources.length > 0 && cat.confidence > 0) {
        const dir = cat.score > 0.1 ? 'bullish' : cat.score < -0.1 ? 'bearish' : 'neutral';
        reasoning.push(
          `${cat.name}: ${dir} (CF=${(cat.score * cat.confidence).toFixed(2)}, weight=${cat.weight.toFixed(2)})`,
        );
      }
    }

    reasoning.push(
      `${horizon}: ${direction} (p=${probability.toFixed(2)}, confidence=${composite.confidence.toFixed(0)}%)`,
    );

    return { horizon, direction, probability, reasoning };
  }

  /**
   * Build a signal snapshot for per-signal accuracy tracking.
   */
  private buildSignalSnapshot(signals: SignalBreakdown): SignalSnapshot {
    const snapshot: SignalSnapshot = {};
    for (const key of SIGNAL_KEYS) {
      const cat = signals[key];
      if (cat.confidence > 0) {
        const dir = cat.score > 0.05 ? 'bullish' : cat.score < -0.05 ? 'bearish' : 'neutral';
        snapshot[key] = { cf: cat.score * cat.confidence, direction: dir };
      }
    }
    return snapshot;
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let chronoVisor: ChronoVisorEngine | null = null;

export function getChronoVisor(): ChronoVisorEngine {
  if (!chronoVisor) {
    chronoVisor = new ChronoVisorEngine();
  }
  return chronoVisor;
}

export function initChronoVisor(): ChronoVisorEngine {
  if (!chronoVisor) {
    chronoVisor = new ChronoVisorEngine();
  }
  return chronoVisor;
}
