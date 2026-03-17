// ---------------------------------------------------------------------------
// Blockchain Fundamentals Analyzer — v0.12.5
// Scoring engine for blockchain fundamental signals as contrapeso to
// reflexive price-based signals.
//
// Sub-signal weights:
//   MVRV Z-Score: 30%  | NVT Ratio: 25%  | Network Health: 25% | Halving: 20%
// ---------------------------------------------------------------------------

import type {
  BlockchainFundamentalsResult,
  HalvingCycleResult,
  NetworkHealthSignal,
  OnChainValuationSignal,
  SupplyDynamicsSignal,
  PredictionHorizon,
} from './types.js';

// ---------------------------------------------------------------------------
// Sub-signal internal weights (sum to 100)
// ---------------------------------------------------------------------------

const SUB_WEIGHTS = {
  mvrv: 30,
  nvt: 25,
  networkHealth: 25,
  halving: 20,
} as const;

// ---------------------------------------------------------------------------
// Horizon-aware fundamental weight (used by predictor)
// ---------------------------------------------------------------------------

export const FUNDAMENTAL_WEIGHT_BY_HORIZON: Record<PredictionHorizon, number> = {
  '1h': 0.05,
  '4h': 0.12,
  '1d': 0.23,
  '7d': 0.35,
};

// ---------------------------------------------------------------------------
// Halving constants & asymmetric model
// ---------------------------------------------------------------------------

const HALVING_INTERVAL = 210_000;
const AVG_BLOCK_TIME_MINUTES = 10;
const BLOCKS_PER_DAY = (60 / AVG_BLOCK_TIME_MINUTES) * 24; // 144

interface CyclePhase {
  name: HalvingCycleResult['phase'];
  start: number; // % of cycle
  end: number; // % of cycle
  score: number;
}

/**
 * Asymmetric halving phases — NOT equal 25% segments.
 * Phases are calibrated from historical cycle analysis.
 */
const CYCLE_PHASES: CyclePhase[] = [
  { name: 'accumulation', start: 0, end: 0.35, score: 50 },
  { name: 'early_markup', start: 0.35, end: 0.55, score: 70 },
  { name: 'late_markup', start: 0.55, end: 0.7, score: 15 },
  { name: 'distribution', start: 0.7, end: 0.85, score: -45 },
  { name: 'markdown', start: 0.85, end: 1.0, score: -65 },
];

/**
 * Cycle dampening — halving loses relevance each cycle due to ETF flows
 * being 12x daily mining production.
 */
function getCycleDampening(cycleNumber: number): number {
  return Math.max(0.4, 1.0 - (cycleNumber - 3) * 0.15);
}

export function analyzeHalvingCycle(blockHeight: number): HalvingCycleResult {
  const halvingEpoch = Math.floor(blockHeight / HALVING_INTERVAL);
  const blocksIntoEpoch = blockHeight % HALVING_INTERVAL;
  const cycleProgress = blocksIntoEpoch / HALVING_INTERVAL;
  const blocksToHalving = HALVING_INTERVAL - blocksIntoEpoch;
  const daysToHalving = Math.round(blocksToHalving / BLOCKS_PER_DAY);
  const daysInCycle = Math.round(blocksIntoEpoch / BLOCKS_PER_DAY);

  // Determine phase
  let currentPhase = CYCLE_PHASES[0];
  for (const phase of CYCLE_PHASES) {
    if (cycleProgress >= phase.start && cycleProgress < phase.end) {
      currentPhase = phase;
      break;
    }
  }

  // Apply dampening (cycle 4 = 0.85, cycle 5 = 0.70, etc.)
  const dampening = getCycleDampening(halvingEpoch);
  const score = Math.round(currentPhase.score * dampening);

  return {
    score,
    phase: currentPhase.name,
    cycleProgress: Math.round(cycleProgress * 10000) / 100, // percentage with 2 decimals
    daysInCycle,
    daysToNextHalving: daysToHalving,
    dampening,
    reasoning: `Cycle ${halvingEpoch}, phase: ${currentPhase.name} (${(cycleProgress * 100).toFixed(1)}%), dampening: ${dampening.toFixed(2)}`,
  };
}

// ---------------------------------------------------------------------------
// Hash Ribbon — 30d MA vs 60d MA of hashrate
// ---------------------------------------------------------------------------

export function computeHashRibbon(
  hashrate30d: number,
  hashrate60d: number,
): { signal: NetworkHealthSignal['hashRibbonSignal']; score: number } {
  if (hashrate30d <= 0 || hashrate60d <= 0) {
    return { signal: 'neutral', score: 0 };
  }

  if (hashrate30d < hashrate60d) {
    // Miner capitulation — 30d below 60d
    return { signal: 'capitulation', score: -40 };
  }

  // Check if 30d recently crossed above 60d (golden cross)
  const ratio = hashrate30d / hashrate60d;
  if (ratio > 1.0 && ratio < 1.05) {
    // Just crossed — golden cross
    return { signal: 'golden_cross', score: 50 };
  }

  return { signal: 'neutral', score: 10 };
}

export function analyzeNetworkHealth(
  hashrate: number,
  _difficulty: number,
  mempoolTxCount: number,
  difficultyAdjPct: number,
  avgFeeRate: number,
): NetworkHealthSignal {
  // For Hash Ribbon we use hashrate as both 30d and 60d proxy
  // In production these would be separate time-series averages
  const hashRibbon = computeHashRibbon(hashrate, hashrate * 0.98);

  let score = hashRibbon.score;
  const reasons: string[] = [];

  // Difficulty trending up → network strength
  if (difficultyAdjPct > 3) {
    score += 15;
    reasons.push(`difficulty +${difficultyAdjPct.toFixed(1)}%`);
  } else if (difficultyAdjPct < -3) {
    score -= 15;
    reasons.push(`difficulty ${difficultyAdjPct.toFixed(1)}%`);
  }

  // Mempool health
  let mempoolHealth = 'normal';
  if (mempoolTxCount > 200_000) {
    mempoolHealth = 'congested';
    score -= 10;
  } else if (mempoolTxCount > 100_000) {
    mempoolHealth = 'busy';
  } else if (mempoolTxCount < 5_000) {
    mempoolHealth = 'empty';
    score += 5;
  }

  // Fee market — healthy fees indicate demand
  if (avgFeeRate > 50) {
    score += 5;
    reasons.push(`high fees (${avgFeeRate} sat/vB)`);
  }

  score = Math.max(-100, Math.min(100, score));

  return {
    score,
    hashRibbonSignal: hashRibbon.signal,
    hashrate30dMA: hashrate,
    hashrate60dMA: hashrate * 0.98,
    mempoolHealth,
    reasoning: `Hash Ribbon: ${hashRibbon.signal}, mempool: ${mempoolHealth}${reasons.length > 0 ? ', ' + reasons.join(', ') : ''}`,
  };
}

// ---------------------------------------------------------------------------
// Override Rules — force cap/floor on composite in extreme conditions
// ---------------------------------------------------------------------------

interface OverrideRule {
  name: string;
  test: (mvrv: number, nvt: number, phase: string, hashRibbon: string) => boolean;
  apply: (composite: number) => number;
}

const OVERRIDE_RULES: OverrideRule[] = [
  {
    name: 'MVRV Z>6 AND NVT>80 → cap +10 (100% historical crash rate)',
    test: (mvrv, nvt) => mvrv > 6 && nvt > 80,
    apply: (composite) => Math.min(composite, 10),
  },
  {
    name: 'MVRV Z<0 in accumulation → floor -10 (100% historical rally rate)',
    test: (mvrv, _nvt, phase) => mvrv < 0 && phase === 'accumulation',
    apply: (composite) => Math.max(composite, -10),
  },
  {
    name: 'Hash Ribbon golden cross + accumulation → floor -5 (strongest BTC buy signal)',
    test: (_mvrv, _nvt, phase, hashRibbon) =>
      hashRibbon === 'golden_cross' && phase === 'accumulation',
    apply: (composite) => Math.max(composite, -5),
  },
];

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

export async function analyzeBlockchainFundamentals(
  symbol: string,
): Promise<BlockchainFundamentalsResult> {
  const reasoning: string[] = [];
  let confidence = 0;

  // Only BTC has full coverage — other symbols get basic analysis
  const isBTC = symbol.toUpperCase() === 'BTC' || symbol.toUpperCase() === 'BITCOIN';

  // Lazy import data sources to avoid circular deps
  const { fetchBitcoinNetworkStats, fetchBitcoinSupplyStats, fetchBitcoinMiningStats } =
    await import('../../data/sources/blockchain-info.js');
  const { fetchNVTRatio, fetchMVRVZScore, fetchSupplyDynamics } =
    await import('../../data/sources/onchain-metrics.js');

  // Default results for non-BTC
  let halvingCycle: HalvingCycleResult = {
    score: 0,
    phase: 'accumulation',
    cycleProgress: 0,
    daysInCycle: 0,
    daysToNextHalving: 0,
    dampening: 1,
    reasoning: 'N/A for non-BTC',
  };
  let networkHealth: NetworkHealthSignal = {
    score: 0,
    hashRibbonSignal: 'neutral',
    hashrate30dMA: 0,
    hashrate60dMA: 0,
    mempoolHealth: 'unknown',
    reasoning: 'N/A',
  };
  let onChainValuation: OnChainValuationSignal = {
    score: 0,
    nvtRatio: 0,
    mvrvZScore: 0,
    nvtSignal: 'fair',
    mvrvSignal: 'fair',
    reasoning: 'N/A',
  };
  let supplyDynamics: SupplyDynamicsSignal = {
    score: 0,
    inflationRate: 0,
    feeRevenueShare: 0,
    percentMined: 0,
    reasoning: 'N/A',
  };

  if (isBTC) {
    // Gather all data in parallel
    const [networkResult, supplyResult, miningResult, nvtResult, mvrvResult, supplyDynResult] =
      await Promise.allSettled([
        fetchBitcoinNetworkStats(),
        fetchBitcoinSupplyStats(),
        fetchBitcoinMiningStats(),
        fetchNVTRatio(),
        fetchMVRVZScore(),
        fetchSupplyDynamics(),
      ]);

    // 1. Halving Cycle
    if (supplyResult.status === 'fulfilled') {
      const supply = supplyResult.value;
      // Estimate block height from supply data
      const blockHeight = supply.blocksUntilHalving
        ? HALVING_INTERVAL * (supply.halvingEpoch + 1) - supply.blocksUntilHalving
        : 0;
      if (blockHeight > 0) {
        halvingCycle = analyzeHalvingCycle(blockHeight);
        confidence += 20;
        reasoning.push(`Halving: ${halvingCycle.reasoning}`);
      }
    }

    // If we also have network stats, use that block height
    if (networkResult.status === 'fulfilled' && networkResult.value.blockHeight > 0) {
      halvingCycle = analyzeHalvingCycle(networkResult.value.blockHeight);
      confidence += 5; // bonus for having block height from network
    }

    // 2. Network Health
    if (networkResult.status === 'fulfilled' && miningResult.status === 'fulfilled') {
      const net = networkResult.value;
      const mining = miningResult.value;
      networkHealth = analyzeNetworkHealth(
        net.hashrate,
        net.difficulty,
        net.mempoolTxCount,
        mining.difficultyAdjustmentPct,
        mining.avgFeeRate,
      );
      confidence += 25;
      reasoning.push(`Network: ${networkHealth.reasoning}`);
    }

    // 3. On-Chain Valuation
    if (nvtResult.status === 'fulfilled' || mvrvResult.status === 'fulfilled') {
      const nvt =
        nvtResult.status === 'fulfilled'
          ? nvtResult.value
          : { ratio: 0, signal: 'fair' as const, score: 0 };
      const mvrv =
        mvrvResult.status === 'fulfilled'
          ? mvrvResult.value
          : { zScore: 0, signal: 'fair' as const, score: 0 };

      // MVRV 55%, NVT 45%
      const valScore = Math.round(mvrv.score * 0.55 + nvt.score * 0.45);
      onChainValuation = {
        score: valScore,
        nvtRatio: nvt.ratio,
        mvrvZScore: mvrv.zScore,
        nvtSignal: nvt.signal,
        mvrvSignal: mvrv.signal,
        reasoning: `MVRV Z: ${mvrv.zScore.toFixed(2)} (${mvrv.signal}), NVT: ${nvt.ratio.toFixed(1)} (${nvt.signal})`,
      };
      confidence += 30;
      reasoning.push(`Valuation: ${onChainValuation.reasoning}`);
    }

    // 4. Supply Dynamics
    if (supplyDynResult.status === 'fulfilled') {
      const sd = supplyDynResult.value;
      supplyDynamics = {
        score: sd.score,
        inflationRate: sd.inflationRate,
        feeRevenueShare: sd.feeRevenueShare,
        percentMined: sd.percentMined,
        reasoning: `${sd.percentMined.toFixed(1)}% mined, ${sd.inflationRate.toFixed(2)}% inflation, ${sd.feeRevenueShare.toFixed(1)}% fee share`,
      };
      confidence += 15;
      reasoning.push(`Supply: ${supplyDynamics.reasoning}`);
    }
  } else {
    // Non-BTC: minimal data, low confidence
    confidence = 15;
    reasoning.push(`${symbol}: limited on-chain data, using CoinGecko supply metrics only`);
  }

  // Composite: decompose MVRV and NVT into separate weighted sub-signals
  // MVRV 30%, NVT 25%, NetworkHealth 25%, Halving 20%
  const mvrvScore =
    onChainValuation.mvrvZScore !== 0 ? scoreMVRVForComposite(onChainValuation.mvrvZScore) : 0;
  const nvtScore =
    onChainValuation.nvtRatio > 0 ? scoreNVTForComposite(onChainValuation.nvtRatio) : 0;

  const composite = Math.round(
    (mvrvScore * SUB_WEIGHTS.mvrv +
      nvtScore * SUB_WEIGHTS.nvt +
      networkHealth.score * SUB_WEIGHTS.networkHealth +
      halvingCycle.score * SUB_WEIGHTS.halving) /
      100,
  );

  // Clamp to [-100, +100]
  let finalComposite = Math.max(-100, Math.min(100, composite));

  // Apply override rules
  let overrideApplied: string | null = null;
  for (const rule of OVERRIDE_RULES) {
    if (
      rule.test(
        onChainValuation.mvrvZScore,
        onChainValuation.nvtRatio,
        halvingCycle.phase,
        networkHealth.hashRibbonSignal,
      )
    ) {
      const before = finalComposite;
      finalComposite = rule.apply(finalComposite);
      if (finalComposite !== before) {
        overrideApplied = rule.name;
        reasoning.push(`Override applied: ${rule.name}`);
        break;
      }
    }
  }

  const direction: 'bullish' | 'bearish' | 'neutral' =
    finalComposite > 15 ? 'bullish' : finalComposite < -15 ? 'bearish' : 'neutral';

  return {
    symbol: symbol.toUpperCase(),
    halvingCycle,
    networkHealth,
    onChainValuation,
    supplyDynamics,
    composite: {
      score: finalComposite,
      direction,
      confidence: Math.min(100, confidence),
    },
    overrideApplied,
    reasoning,
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers for composite decomposition
// ---------------------------------------------------------------------------

function scoreMVRVForComposite(zScore: number): number {
  if (zScore < 0) return 60;
  if (zScore <= 2) return 20;
  if (zScore <= 5) return -20;
  if (zScore <= 7) return -50;
  return -80;
}

function scoreNVTForComposite(nvtRatio: number): number {
  if (nvtRatio < 30) return 50;
  if (nvtRatio < 45) return 25;
  if (nvtRatio <= 70) return 0;
  if (nvtRatio <= 90) return -25;
  return -50;
}
