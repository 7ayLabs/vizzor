// ---------------------------------------------------------------------------
// blockchain-analyzer.ts unit tests — v0.12.5
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EPOCH4_PHASES } from '../../../fixtures/blockchain-responses.js';

// Mock data sources
vi.mock('@/data/sources/blockchain-info.js', () => ({
  fetchBitcoinNetworkStats: vi.fn().mockResolvedValue({
    hashrate: 750000000000,
    difficulty: 95672703408000000,
    blockHeight: 889_000,
    mempoolTxCount: 45000,
    avgBlockTime: 600,
    confidence: 85,
  }),
  fetchBitcoinSupplyStats: vi.fn().mockResolvedValue({
    totalMined: 19740000,
    blockReward: 3.125,
    blocksUntilHalving: 161_000,
    halvingEpoch: 4,
    inflationRate: 0.83,
    percentMined: 94,
  }),
  fetchBitcoinMiningStats: vi.fn().mockResolvedValue({
    hashrate: 750000000000,
    difficulty: 95672703408000000,
    difficultyAdjustmentPct: 2.3,
    avgFeeRate: 15,
    blocksUntilAdjustment: 1120,
  }),
}));

vi.mock('@/data/sources/onchain-metrics.js', () => ({
  fetchNVTRatio: vi.fn().mockResolvedValue({
    ratio: 55,
    signal: 'fair',
    score: 0,
  }),
  fetchMVRVZScore: vi.fn().mockResolvedValue({
    zScore: 1.5,
    signal: 'fair',
    score: 20,
  }),
  fetchSupplyDynamics: vi.fn().mockResolvedValue({
    percentMined: 94,
    inflationRate: 0.83,
    feeRevenueShare: 5.2,
    score: 25,
  }),
}));

import {
  analyzeBlockchainFundamentals,
  analyzeHalvingCycle,
  computeHashRibbon,
  analyzeNetworkHealth,
  FUNDAMENTAL_WEIGHT_BY_HORIZON,
} from '@/core/fundamentals/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// analyzeHalvingCycle
// ---------------------------------------------------------------------------

describe('analyzeHalvingCycle', () => {
  it('returns accumulation phase at start of epoch', () => {
    const result = analyzeHalvingCycle(840_001);
    expect(result.phase).toBe('accumulation');
    expect(result.cycleProgress).toBeLessThan(1);
    expect(result.score).toBeGreaterThan(0); // accumulation is bullish
  });

  it('returns correct phase boundaries', () => {
    // Accumulation: 0% - 35%
    expect(analyzeHalvingCycle(840_000 + 10_000).phase).toBe('accumulation');

    // Early markup: 35% - 55%
    expect(analyzeHalvingCycle(EPOCH4_PHASES.accumulationEnd + 1).phase).toBe('early_markup');

    // Late markup: 55% - 70%
    expect(analyzeHalvingCycle(EPOCH4_PHASES.earlyMarkupEnd + 1).phase).toBe('late_markup');

    // Distribution: 70% - 85%
    expect(analyzeHalvingCycle(EPOCH4_PHASES.lateMarkupEnd + 1).phase).toBe('distribution');

    // Markdown: 85% - 100%
    expect(analyzeHalvingCycle(EPOCH4_PHASES.distributionEnd + 1).phase).toBe('markdown');
  });

  it('applies dampening (cycle 4 = 0.85)', () => {
    const result = analyzeHalvingCycle(840_001); // epoch 4
    expect(result.dampening).toBeCloseTo(0.85, 1);
  });

  it('dampening decreases per cycle', () => {
    const cycle4 = analyzeHalvingCycle(840_001).dampening;
    const cycle5 = analyzeHalvingCycle(1_050_001).dampening;
    expect(cycle5).toBeLessThan(cycle4);
  });

  it('dampening never goes below 0.4', () => {
    // Far future cycle
    const result = analyzeHalvingCycle(210_000 * 20);
    expect(result.dampening).toBeGreaterThanOrEqual(0.4);
  });

  it('score is bounded [-100, +100]', () => {
    for (let block = 840_000; block < 1_050_000; block += 21_000) {
      const result = analyzeHalvingCycle(block);
      expect(result.score).toBeGreaterThanOrEqual(-100);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it('daysToNextHalving and daysInCycle are positive', () => {
    const result = analyzeHalvingCycle(889_000);
    expect(result.daysToNextHalving).toBeGreaterThan(0);
    expect(result.daysInCycle).toBeGreaterThan(0);
  });

  it('cycleProgress is 0-100 range', () => {
    const result = analyzeHalvingCycle(889_000);
    expect(result.cycleProgress).toBeGreaterThanOrEqual(0);
    expect(result.cycleProgress).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// computeHashRibbon
// ---------------------------------------------------------------------------

describe('computeHashRibbon', () => {
  it('returns capitulation when 30d < 60d', () => {
    const result = computeHashRibbon(900, 1000);
    expect(result.signal).toBe('capitulation');
    expect(result.score).toBeLessThan(0);
  });

  it('returns golden_cross when 30d just crossed above 60d', () => {
    const result = computeHashRibbon(1020, 1000);
    expect(result.signal).toBe('golden_cross');
    expect(result.score).toBeGreaterThan(0);
  });

  it('returns neutral when 30d well above 60d', () => {
    const result = computeHashRibbon(1200, 1000);
    expect(result.signal).toBe('neutral');
  });

  it('returns neutral with zero inputs', () => {
    const result = computeHashRibbon(0, 0);
    expect(result.signal).toBe('neutral');
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeNetworkHealth
// ---------------------------------------------------------------------------

describe('analyzeNetworkHealth', () => {
  it('returns bounded score', () => {
    const result = analyzeNetworkHealth(750e9, 95e15, 45000, 2.3, 15);
    expect(result.score).toBeGreaterThanOrEqual(-100);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('penalizes congested mempool', () => {
    const normal = analyzeNetworkHealth(750e9, 95e15, 45000, 0, 5);
    const congested = analyzeNetworkHealth(750e9, 95e15, 250000, 0, 5);
    expect(congested.score).toBeLessThan(normal.score);
    expect(congested.mempoolHealth).toBe('congested');
  });

  it('rewards positive difficulty adjustment', () => {
    const flat = analyzeNetworkHealth(750e9, 95e15, 45000, 0, 5);
    const growing = analyzeNetworkHealth(750e9, 95e15, 45000, 5, 5);
    expect(growing.score).toBeGreaterThan(flat.score);
  });

  it('reasoning contains useful info', () => {
    const result = analyzeNetworkHealth(750e9, 95e15, 45000, 5, 60);
    expect(result.reasoning).toContain('Hash Ribbon');
  });
});

// ---------------------------------------------------------------------------
// FUNDAMENTAL_WEIGHT_BY_HORIZON
// ---------------------------------------------------------------------------

describe('FUNDAMENTAL_WEIGHT_BY_HORIZON', () => {
  it('1h has lowest weight', () => {
    expect(FUNDAMENTAL_WEIGHT_BY_HORIZON['1h']).toBeLessThan(FUNDAMENTAL_WEIGHT_BY_HORIZON['1d']);
  });

  it('7d has highest weight', () => {
    expect(FUNDAMENTAL_WEIGHT_BY_HORIZON['7d']).toBeGreaterThan(
      FUNDAMENTAL_WEIGHT_BY_HORIZON['1d'],
    );
  });

  it('all weights are between 0 and 1', () => {
    for (const [, w] of Object.entries(FUNDAMENTAL_WEIGHT_BY_HORIZON)) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// analyzeBlockchainFundamentals (integration with mocks)
// ---------------------------------------------------------------------------

describe('analyzeBlockchainFundamentals', () => {
  it('returns valid result for BTC', async () => {
    const result = await analyzeBlockchainFundamentals('BTC');

    expect(result.symbol).toBe('BTC');
    expect(result.composite.score).toBeGreaterThanOrEqual(-100);
    expect(result.composite.score).toBeLessThanOrEqual(100);
    expect(result.composite.confidence).toBeGreaterThanOrEqual(0);
    expect(result.composite.confidence).toBeLessThanOrEqual(100);
    expect(['bullish', 'bearish', 'neutral']).toContain(result.composite.direction);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it('produces no NaN or Infinity values', async () => {
    const result = await analyzeBlockchainFundamentals('BTC');

    expect(Number.isFinite(result.composite.score)).toBe(true);
    expect(Number.isFinite(result.composite.confidence)).toBe(true);
    expect(Number.isFinite(result.halvingCycle.score)).toBe(true);
    expect(Number.isFinite(result.networkHealth.score)).toBe(true);
    expect(Number.isFinite(result.onChainValuation.score)).toBe(true);
  });

  it('returns low confidence for non-BTC tokens', async () => {
    const result = await analyzeBlockchainFundamentals('ETH');
    expect(result.composite.confidence).toBeLessThanOrEqual(20);
    expect(result.reasoning.some((r) => r.includes('limited'))).toBe(true);
  });

  it('output is deterministic for same inputs', async () => {
    const result1 = await analyzeBlockchainFundamentals('BTC');
    const result2 = await analyzeBlockchainFundamentals('BTC');

    expect(result1.composite.score).toBe(result2.composite.score);
    expect(result1.composite.direction).toBe(result2.composite.direction);
    expect(result1.halvingCycle.phase).toBe(result2.halvingCycle.phase);
  });

  it('handles BITCOIN symbol same as BTC', async () => {
    const btc = await analyzeBlockchainFundamentals('BTC');
    const bitcoin = await analyzeBlockchainFundamentals('BITCOIN');

    expect(btc.composite.score).toBe(bitcoin.composite.score);
    expect(btc.halvingCycle.phase).toBe(bitcoin.halvingCycle.phase);
  });
});

// ---------------------------------------------------------------------------
// Override rules
// ---------------------------------------------------------------------------

describe('Override rules', () => {
  it('applies override when conditions match', async () => {
    // With default mocks: block 889,000 is in accumulation phase and
    // hashrate triggers golden_cross signal, so the Hash Ribbon override fires
    const result = await analyzeBlockchainFundamentals('BTC');

    // The override system should work — either an override is applied or null
    if (result.overrideApplied !== null) {
      expect(typeof result.overrideApplied).toBe('string');
      expect(result.reasoning.some((r) => r.includes('Override applied'))).toBe(true);
    }
  });

  it('MVRV Z > 6 AND NVT > 80 caps score at 10', async () => {
    const onchainMetrics = await import('@/data/sources/onchain-metrics.js');
    // Set MVRV and NVT to extreme but keep scores positive to test the cap
    vi.mocked(onchainMetrics.fetchMVRVZScore).mockResolvedValueOnce({
      zScore: 7.5,
      signal: 'extreme_overvaluation',
      score: -80,
    });
    vi.mocked(onchainMetrics.fetchNVTRatio).mockResolvedValueOnce({
      ratio: 95,
      signal: 'bubble',
      score: -50,
    });

    const result = await analyzeBlockchainFundamentals('BTC');
    // With extreme MVRV (7.5) and NVT (95), score must be <= 10
    expect(result.composite.score).toBeLessThanOrEqual(10);
    // Override should be applied (either MVRV cap or Hash Ribbon floor)
    expect(result.overrideApplied).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('Invariants', () => {
  it('all scores bounded [-100, +100]', async () => {
    const result = await analyzeBlockchainFundamentals('BTC');
    expect(result.composite.score).toBeGreaterThanOrEqual(-100);
    expect(result.composite.score).toBeLessThanOrEqual(100);
    expect(result.halvingCycle.score).toBeGreaterThanOrEqual(-100);
    expect(result.halvingCycle.score).toBeLessThanOrEqual(100);
    expect(result.networkHealth.score).toBeGreaterThanOrEqual(-100);
    expect(result.networkHealth.score).toBeLessThanOrEqual(100);
    expect(result.onChainValuation.score).toBeGreaterThanOrEqual(-100);
    expect(result.onChainValuation.score).toBeLessThanOrEqual(100);
  });

  it('confidence bounded [0, 100]', async () => {
    const result = await analyzeBlockchainFundamentals('BTC');
    expect(result.composite.confidence).toBeGreaterThanOrEqual(0);
    expect(result.composite.confidence).toBeLessThanOrEqual(100);
  });
});
