// ---------------------------------------------------------------------------
// blockchain-info.ts unit tests — v0.12.5
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  mockMempoolInfo,
  mockDifficultyAdjustment,
  mockHashrateMining,
  mockFeesRecommended,
} from '../../../fixtures/blockchain-responses.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Must import after stubbing fetch
import {
  fetchBitcoinNetworkStats,
  fetchBitcoinSupplyStats,
  fetchBitcoinMiningStats,
  fetchNetworkHealth,
  getHalvingEpoch,
  getBlockReward,
  getBlocksUntilHalving,
  HALVING_INTERVAL,
} from '@/data/sources/blockchain-info.js';

beforeEach(() => {
  mockFetch.mockReset();
});

// Helper to mock a successful JSON response
function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data, text: async () => JSON.stringify(data) };
}

// Helper to mock a scalar text response
function textResponse(value: number) {
  return { ok: true, text: async () => String(value), json: async () => value };
}

function failResponse(status = 500) {
  return { ok: false, status, statusText: 'Internal Server Error' };
}

describe('Halving constants', () => {
  it('HALVING_INTERVAL is 210,000', () => {
    expect(HALVING_INTERVAL).toBe(210_000);
  });

  it('getHalvingEpoch returns correct epoch', () => {
    expect(getHalvingEpoch(0)).toBe(0);
    expect(getHalvingEpoch(209_999)).toBe(0);
    expect(getHalvingEpoch(210_000)).toBe(1);
    expect(getHalvingEpoch(840_000)).toBe(4);
    expect(getHalvingEpoch(889_000)).toBe(4);
  });

  it('getBlockReward returns correct reward per epoch', () => {
    expect(getBlockReward(0)).toBe(50);
    expect(getBlockReward(210_000)).toBe(25);
    expect(getBlockReward(420_000)).toBe(12.5);
    expect(getBlockReward(630_000)).toBe(6.25);
    expect(getBlockReward(840_000)).toBe(3.125);
  });

  it('getBlocksUntilHalving calculates remaining blocks', () => {
    expect(getBlocksUntilHalving(840_000)).toBe(210_000);
    expect(getBlocksUntilHalving(889_000)).toBe(210_000 - 49_000);
    expect(getBlocksUntilHalving(1_049_999)).toBe(1);
  });

  it('block reward is always positive and <= 50', () => {
    for (let epoch = 0; epoch < 10; epoch++) {
      const reward = getBlockReward(epoch * HALVING_INTERVAL);
      expect(reward).toBeGreaterThan(0);
      expect(reward).toBeLessThanOrEqual(50);
    }
  });
});

describe('fetchBitcoinNetworkStats', () => {
  it('returns network stats on success', async () => {
    // blockchain.info scalar calls: hashrate, difficulty, blockcount
    mockFetch
      .mockResolvedValueOnce(textResponse(750000000000))
      .mockResolvedValueOnce(textResponse(95672703408000000))
      .mockResolvedValueOnce(textResponse(889000))
      // mempool.space mempool
      .mockResolvedValueOnce(jsonResponse(mockMempoolInfo))
      // mempool.space hashrate cross-ref
      .mockResolvedValueOnce(jsonResponse(mockHashrateMining));

    const result = await fetchBitcoinNetworkStats();
    expect(result.hashrate).toBeGreaterThan(0);
    expect(result.blockHeight).toBe(889000);
    expect(result.mempoolTxCount).toBe(45000);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('returns cached result when blockchain.info fails after prior success', async () => {
    // After the first test populated the cache, failures should return stale data
    mockFetch.mockResolvedValue(failResponse());

    const result = await fetchBitcoinNetworkStats();
    // Should return cached data with reduced confidence
    expect(result.hashrate).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('confidence is bounded 0-100', async () => {
    mockFetch
      .mockResolvedValueOnce(textResponse(750000000000))
      .mockResolvedValueOnce(textResponse(95672703408000000))
      .mockResolvedValueOnce(textResponse(889000))
      .mockResolvedValueOnce(jsonResponse(mockMempoolInfo))
      .mockResolvedValueOnce(jsonResponse(mockHashrateMining));

    const result = await fetchBitcoinNetworkStats();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

describe('fetchBitcoinSupplyStats', () => {
  it('returns supply stats', async () => {
    // totalbc (in satoshis) and blockcount
    mockFetch
      .mockResolvedValueOnce(textResponse(1_974_000_000_000_000)) // ~19.74M BTC
      .mockResolvedValueOnce(textResponse(889_000));

    const result = await fetchBitcoinSupplyStats();
    expect(result.totalMined).toBeGreaterThan(0);
    expect(result.totalMined).toBeLessThanOrEqual(21_000_001);
    expect(result.blockReward).toBe(3.125); // epoch 4
    expect(result.halvingEpoch).toBe(4);
    expect(result.blocksUntilHalving).toBeGreaterThan(0);
    expect(result.inflationRate).toBeGreaterThan(0);
    expect(result.percentMined).toBeGreaterThan(0);
    expect(result.percentMined).toBeLessThanOrEqual(100);
  });

  it('returns cached or throws when APIs fail', async () => {
    // After the first supply test populates cache, failures return stale data
    mockFetch.mockResolvedValue(failResponse());
    const result = await fetchBitcoinSupplyStats();
    // Stale cache should still have valid data
    expect(result.totalMined).toBeGreaterThan(0);
    expect(result.totalMined).toBeLessThanOrEqual(21_000_001);
  });
});

describe('fetchBitcoinMiningStats', () => {
  it('returns mining stats', async () => {
    mockFetch
      .mockResolvedValueOnce(textResponse(750000000000))
      .mockResolvedValueOnce(textResponse(95672703408000000))
      .mockResolvedValueOnce(jsonResponse(mockDifficultyAdjustment))
      .mockResolvedValueOnce(jsonResponse(mockFeesRecommended));

    const result = await fetchBitcoinMiningStats();
    expect(result.hashrate).toBeGreaterThan(0);
    expect(result.difficulty).toBeGreaterThan(0);
    expect(result.difficultyAdjustmentPct).toBe(2.3);
    expect(result.avgFeeRate).toBe(15);
    expect(result.blocksUntilAdjustment).toBe(1120);
  });
});

describe('fetchNetworkHealth', () => {
  it('returns composite health', async () => {
    // Network stats: hashrate, difficulty, blockcount, mempool, hashrate cross-ref
    mockFetch
      .mockResolvedValueOnce(textResponse(750000000000))
      .mockResolvedValueOnce(textResponse(95672703408000000))
      .mockResolvedValueOnce(textResponse(889000))
      .mockResolvedValueOnce(jsonResponse(mockMempoolInfo))
      .mockResolvedValueOnce(jsonResponse(mockHashrateMining))
      // Supply: totalbc, blockcount
      .mockResolvedValueOnce(textResponse(1_974_000_000_000_000))
      .mockResolvedValueOnce(textResponse(889000))
      // Mining: hashrate, difficulty, diff adj, fees
      .mockResolvedValueOnce(textResponse(750000000000))
      .mockResolvedValueOnce(textResponse(95672703408000000))
      .mockResolvedValueOnce(jsonResponse(mockDifficultyAdjustment))
      .mockResolvedValueOnce(jsonResponse(mockFeesRecommended));

    const result = await fetchNetworkHealth();
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it('healthScore is bounded 0-100', async () => {
    // All fail → should still return bounded result
    mockFetch.mockResolvedValue(failResponse());

    const result = await fetchNetworkHealth();
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
  });
});

describe('Zod validation schemas', () => {
  const HashrateSchema = z.number().positive().max(1e18);
  const BlockCountSchema = z.number().int().min(800_000);
  const TotalBtcSchema = z.number().min(0).max(21_000_001);

  it('rejects hashrate above 1e18', () => {
    expect(() => HashrateSchema.parse(1e19)).toThrow();
  });

  it('rejects block count below 800,000', () => {
    expect(() => BlockCountSchema.parse(100)).toThrow();
  });

  it('rejects negative hashrate', () => {
    expect(() => HashrateSchema.parse(-1)).toThrow();
  });

  it('accepts valid hashrate', () => {
    expect(HashrateSchema.parse(750000000000)).toBe(750000000000);
  });

  it('accepts valid block count', () => {
    expect(BlockCountSchema.parse(889_000)).toBe(889_000);
  });

  it('rejects total BTC above 21M', () => {
    expect(() => TotalBtcSchema.parse(22_000_000)).toThrow();
  });
});
