// ---------------------------------------------------------------------------
// ChronoVisor engine — weighted ensemble orchestrator
// Combines on-chain, ML, prediction market, social, and pattern signals
// ---------------------------------------------------------------------------

import type {
  ChronoVisorResult,
  WeightConfig,
  SignalBreakdown,
  CompositeScore,
  SignalCategory,
} from './types.js';
import { WeightLearner } from './weight-learner.js';
import { AccuracyTracker } from './accuracy-tracker.js';
import { PatternLibrary } from './pattern-library.js';
import { PredictionResolver } from './prediction-resolver.js';
import { fetchAllPredictionMarketSignals } from '../../data/sources/prediction-markets/index.js';
import { getMLClient } from '../../ml/client.js';
import { createLogger } from '../../utils/logger.js';

// Lazy imports to avoid circular dependency issues — these may not always
// be available depending on which adapters/sources the user has configured.
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
  onChain: 0.3,
  mlEnsemble: 0.25,
  predictionMarkets: 0.2,
  socialNarrative: 0.15,
  patternMatch: 0.1,
};

const DEFAULT_HORIZONS: ('1h' | '4h' | '1d' | '7d')[] = ['1h', '4h', '1d', '7d'];

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
    this.predictionResolver = new PredictionResolver(this.accuracyTracker, this.weightLearner);
    this.predictionResolver.start();
    log.info('ChronoVisor engine initialized (resolver active)');
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
   * 1. Gather signals from all 5 categories in parallel
   * 2. Get learned weights (or use defaults)
   * 3. Compute weighted composite score
   * 4. Generate predictions per horizon
   * 5. Log predictions for accuracy tracking
   * 6. Return full ChronoVisorResult
   */
  async predict(
    symbol: string,
    horizons?: ('1h' | '4h' | '1d' | '7d')[],
  ): Promise<ChronoVisorResult> {
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
    };

    // 2. Get learned weights
    const weights = this.weightLearner.getWeights(normalizedSymbol);
    this.applyWeights(signals, weights);

    // 3. Compute weighted composite score
    const composite = this.computeComposite(signals, weights);

    // 4. Generate predictions per horizon
    const predictions = activeHorizons.map((horizon) =>
      this.generateHorizonPrediction(normalizedSymbol, horizon, composite, signals),
    );

    // 5. Fetch current price for accuracy tracking (initial_price)
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

    // 6. Log each prediction for accuracy tracking
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
      });
    }

    // 7. Fetch historical accuracy (may be null if no resolved predictions yet)
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
      `${normalizedSymbol} composite: ${composite.score.toFixed(3)} (${composite.direction}, confidence ${composite.confidence.toFixed(0)}%)`,
    );

    return result;
  }

  // -----------------------------------------------------------------------
  // Signal gatherers
  // -----------------------------------------------------------------------

  /**
   * On-chain signals: whale flow, exchange flow, LP delta.
   * Uses Binance funding rate and open interest as proxy signals.
   */
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
        // High positive funding = longs over-leveraged (bearish contrarian)
        // Negative funding = shorts over-leveraged (bullish contrarian)
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
        // High OI generally indicates strong market interest
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

  /**
   * ML ensemble signals: uses the ML sidecar predict endpoint.
   */
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
        // Map direction + probability to a -1..1 score
        if (prediction.direction === 'up') {
          score = prediction.probability;
        } else if (prediction.direction === 'down') {
          score = -prediction.probability;
        } else {
          score = 0;
        }
        confidence = prediction.confidence / 100; // normalize 0-100 -> 0-1
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

  /**
   * Prediction market signals: aggregates from all registered prediction market
   * adapters and looks for markets related to this symbol.
   */
  async gatherPredictionMarketSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;

    try {
      const signals = await fetchAllPredictionMarketSignals('crypto_price');

      // Filter to signals related to this symbol
      const relevant = signals.filter((s) =>
        s.relatedTokens.some((t) => t.toUpperCase() === symbol.toUpperCase()),
      );

      if (relevant.length > 0) {
        // Average probability and momentum across related markets
        let totalProbability = 0;
        let totalMomentum = 0;

        for (const sig of relevant) {
          totalProbability += sig.probability;
          totalMomentum += sig.momentumScore;
          sources.push(`${sig.platform}:${sig.marketId}(p=${sig.probability.toFixed(2)})`);
        }

        const avgProbability = totalProbability / relevant.length;
        const avgMomentum = totalMomentum / relevant.length;

        // probability > 0.5 = bullish, < 0.5 = bearish, centered at 0
        score = (avgProbability - 0.5) * 2;

        // Momentum amplifies or dampens the signal
        score += avgMomentum * 0.3;
        score = Math.max(-1, Math.min(1, score));

        // Confidence scales with number of markets and total volume
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

  /**
   * Social / narrative signals: from sentiment analysis (news + DEX data).
   */
  async gatherSocialSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;

    try {
      const analyzeSentiment = await lazySentiment();
      const sentiment = await analyzeSentiment(symbol);

      score = sentiment.overall; // already -1..1
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

  /**
   * Pattern-matching signals: searches the pattern library for similar
   * historical patterns and derives a directional signal.
   */
  async gatherPatternSignals(symbol: string): Promise<SignalCategory> {
    const sources: string[] = [];
    let score = 0;
    let confidence = 0;

    try {
      // Build a simple feature vector from available ML features
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
          // Weighted average of matched pattern outcomes
          let totalWeight = 0;
          let weightedScore = 0;

          for (const match of matches) {
            // Use similarity as the weight
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

          // Confidence based on how many patterns matched and how similar they are
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

  /**
   * Extracts a SignalCategory from a PromiseSettledResult, returning a neutral
   * fallback on rejection.
   */
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

  /**
   * Apply learned weights to the signal breakdown.
   */
  private applyWeights(signals: SignalBreakdown, weights: WeightConfig): void {
    signals.onChain.weight = weights.onChain;
    signals.mlEnsemble.weight = weights.mlEnsemble;
    signals.predictionMarkets.weight = weights.predictionMarkets;
    signals.socialNarrative.weight = weights.socialNarrative;
    signals.patternMatch.weight = weights.patternMatch;
  }

  /**
   * Compute the weighted composite score from all signal categories.
   */
  private computeComposite(signals: SignalBreakdown, _weights: WeightConfig): CompositeScore {
    const categories: SignalCategory[] = [
      signals.onChain,
      signals.mlEnsemble,
      signals.predictionMarkets,
      signals.socialNarrative,
      signals.patternMatch,
    ];

    let weightedScore = 0;
    let weightedConfidence = 0;
    let totalWeight = 0;

    for (const cat of categories) {
      weightedScore += cat.score * cat.weight;
      weightedConfidence += cat.confidence * cat.weight;
      totalWeight += cat.weight;
    }

    // Normalize in case weights don't sum to exactly 1
    const score = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const confidenceRaw = totalWeight > 0 ? weightedConfidence / totalWeight : 0;

    // Scale confidence to 0-100 range
    const confidence = Math.min(100, Math.max(0, confidenceRaw * 100));

    const direction: CompositeScore['direction'] =
      score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';

    return {
      score: Math.max(-1, Math.min(1, score)),
      direction,
      confidence,
      signalBreakdown: signals,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate a single horizon prediction from the composite score.
   * Longer horizons have lower confidence due to uncertainty amplification.
   */
  private generateHorizonPrediction(
    _symbol: string,
    horizon: '1h' | '4h' | '1d' | '7d',
    composite: CompositeScore,
    signals: SignalBreakdown,
  ): ChronoVisorResult['predictions'][number] {
    // Uncertainty multiplier: longer horizons reduce confidence
    const horizonMultiplier: Record<string, number> = {
      '1h': 1.0,
      '4h': 0.85,
      '1d': 0.7,
      '7d': 0.5,
    };

    const multiplier = horizonMultiplier[horizon] ?? 0.5;
    const adjustedScore = composite.score * multiplier;

    const direction: 'up' | 'down' | 'sideways' =
      adjustedScore > 0.1 ? 'up' : adjustedScore < -0.1 ? 'down' : 'sideways';

    // Probability is the absolute score value scaled by confidence
    const probability = Math.min(
      0.95,
      Math.max(0.05, Math.abs(adjustedScore) * (composite.confidence / 100)),
    );

    // Build reasoning from signal sources
    const reasoning: string[] = [];
    const allCategories = [
      signals.onChain,
      signals.mlEnsemble,
      signals.predictionMarkets,
      signals.socialNarrative,
      signals.patternMatch,
    ];

    for (const cat of allCategories) {
      if (cat.sources.length > 0 && cat.confidence > 0) {
        const dir = cat.score > 0.1 ? 'bullish' : cat.score < -0.1 ? 'bearish' : 'neutral';
        reasoning.push(
          `${cat.name}: ${dir} (score=${cat.score.toFixed(2)}, conf=${cat.confidence.toFixed(2)}, weight=${cat.weight.toFixed(2)})`,
        );
      }
    }

    reasoning.push(
      `${horizon} composite: ${adjustedScore.toFixed(3)} -> ${direction} (p=${probability.toFixed(2)})`,
    );

    return { horizon, direction, probability, reasoning };
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let chronoVisor: ChronoVisorEngine | null = null;

/**
 * Returns the singleton ChronoVisor engine, creating it if necessary.
 */
export function getChronoVisor(): ChronoVisorEngine {
  if (!chronoVisor) {
    chronoVisor = new ChronoVisorEngine();
  }
  return chronoVisor;
}

/**
 * Explicitly initialize the ChronoVisor engine (idempotent).
 */
export function initChronoVisor(): ChronoVisorEngine {
  if (!chronoVisor) {
    chronoVisor = new ChronoVisorEngine();
  }
  return chronoVisor;
}
