// ---------------------------------------------------------------------------
// feature-engineer.ts — buildBlockchainFeatureVector tests — v0.12.5
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all data sources used by buildBlockchainFeatureVector
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

vi.mock('@/core/fundamentals/blockchain-analyzer.js', () => ({
  analyzeHalvingCycle: vi.fn().mockReturnValue({
    phase: 'accumulation',
    cycleProgress: 23.3,
    score: 42,
    daysInCycle: 150,
    daysToNextHalving: 1100,
    dampening: 0.85,
    reasoning: 'test',
  }),
  computeHashRibbon: vi.fn().mockReturnValue({
    signal: 'neutral',
    score: 0,
    ratio: 1.02,
  }),
}));

import { buildBlockchainFeatureVector } from '@/ml/feature-engineer.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildBlockchainFeatureVector', () => {
  it('returns all 13 features', async () => {
    const features = await buildBlockchainFeatureVector();

    expect(features).toHaveProperty('halving_cycle_progress');
    expect(features).toHaveProperty('days_since_halving');
    expect(features).toHaveProperty('days_to_next_halving');
    expect(features).toHaveProperty('block_reward');
    expect(features).toHaveProperty('hashrate_change_30d');
    expect(features).toHaveProperty('difficulty_change_14d');
    expect(features).toHaveProperty('nvt_ratio');
    expect(features).toHaveProperty('mvrv_z_score');
    expect(features).toHaveProperty('inflation_rate');
    expect(features).toHaveProperty('fee_revenue_share');
    expect(features).toHaveProperty('mempool_size_mb');
    expect(features).toHaveProperty('avg_fee_rate');
    expect(features).toHaveProperty('hash_ribbon_signal');

    expect(Object.keys(features)).toHaveLength(13);
  });

  it('populates values from mocked data sources', async () => {
    const features = await buildBlockchainFeatureVector();

    expect(features.halving_cycle_progress).toBeCloseTo(23.3, 0);
    expect(features.block_reward).toBe(3.125);
    expect(features.nvt_ratio).toBe(55);
    expect(features.mvrv_z_score).toBe(1.5);
    expect(features.inflation_rate).toBe(0.83);
    expect(features.fee_revenue_share).toBe(5.2);
    expect(features.avg_fee_rate).toBe(15);
  });

  it('hash_ribbon_signal is 0 for neutral', async () => {
    const features = await buildBlockchainFeatureVector();
    expect(features.hash_ribbon_signal).toBe(0);
  });

  it('no NaN or Infinity in any feature', async () => {
    const features = await buildBlockchainFeatureVector();
    for (const [key, value] of Object.entries(features)) {
      expect(Number.isFinite(value), `${key} should be finite`).toBe(true);
    }
  });

  it('returns zero defaults when all sources fail', async () => {
    const blockchainInfo = await import('@/data/sources/blockchain-info.js');
    const onchainMetrics = await import('@/data/sources/onchain-metrics.js');
    const analyzer = await import('@/core/fundamentals/blockchain-analyzer.js');

    vi.mocked(blockchainInfo.fetchBitcoinNetworkStats).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(blockchainInfo.fetchBitcoinSupplyStats).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(blockchainInfo.fetchBitcoinMiningStats).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(onchainMetrics.fetchNVTRatio).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(onchainMetrics.fetchMVRVZScore).mockRejectedValueOnce(new Error('fail'));
    vi.mocked(onchainMetrics.fetchSupplyDynamics).mockRejectedValueOnce(new Error('fail'));

    const features = await buildBlockchainFeatureVector();
    // All values should be 0 or finite defaults
    expect(features.halving_cycle_progress).toBe(0);
    expect(features.block_reward).toBe(0);
    expect(features.nvt_ratio).toBe(0);
    expect(features.mvrv_z_score).toBe(0);
    expect(features.hash_ribbon_signal).toBe(0);

    // No value should be NaN or Infinity
    for (const [key, value] of Object.entries(features)) {
      expect(Number.isFinite(value), `${key} should be finite even on failure`).toBe(true);
    }
  });
});
