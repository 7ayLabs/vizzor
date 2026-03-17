// ---------------------------------------------------------------------------
// onchain-metrics.ts unit tests — v0.12.5
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockMarketCapChart,
  mockTxVolumeChart,
  mockPriceChart3Y,
  mockTotalBitcoinsChart,
  mockTxFeesChart,
  mockMinerRevenueChart,
} from '../../../fixtures/blockchain-responses.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  scoreNVT,
  fetchNVTRatio,
  scoreMVRV,
  fetchMVRVZScore,
  computeS2F,
  fetchSupplyDynamics,
  fetchOnChainValuation,
} from '@/data/sources/onchain-metrics.js';

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data, text: async () => JSON.stringify(data) };
}

function failResponse(status = 500) {
  return { ok: false, status, statusText: 'Internal Server Error' };
}

// ---------------------------------------------------------------------------
// scoreNVT — pure function tests
// ---------------------------------------------------------------------------

describe('scoreNVT', () => {
  it('deeply_undervalued below 30', () => {
    const r = scoreNVT(20);
    expect(r.signal).toBe('deeply_undervalued');
    expect(r.score).toBe(50);
  });

  it('undervalued 30-45', () => {
    const r = scoreNVT(35);
    expect(r.signal).toBe('undervalued');
    expect(r.score).toBe(25);
  });

  it('fair 45-70', () => {
    const r = scoreNVT(55);
    expect(r.signal).toBe('fair');
    expect(r.score).toBe(0);
  });

  it('overvalued 70-90', () => {
    const r = scoreNVT(80);
    expect(r.signal).toBe('overvalued');
    expect(r.score).toBe(-25);
  });

  it('bubble above 90', () => {
    const r = scoreNVT(100);
    expect(r.signal).toBe('bubble');
    expect(r.score).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// scoreMVRV — pure function tests
// ---------------------------------------------------------------------------

describe('scoreMVRV', () => {
  it('strong_buy below 0', () => {
    const r = scoreMVRV(-1);
    expect(r.signal).toBe('strong_buy');
    expect(r.score).toBe(60);
  });

  it('fair 0-2', () => {
    const r = scoreMVRV(1.5);
    expect(r.signal).toBe('fair');
    expect(r.score).toBe(20);
  });

  it('expensive 2-5', () => {
    const r = scoreMVRV(3.5);
    expect(r.signal).toBe('expensive');
    expect(r.score).toBe(-20);
  });

  it('near_top 5-7', () => {
    const r = scoreMVRV(6);
    expect(r.signal).toBe('near_top');
    expect(r.score).toBe(-50);
  });

  it('extreme_overvaluation above 7', () => {
    const r = scoreMVRV(8);
    expect(r.signal).toBe('extreme_overvaluation');
    expect(r.score).toBe(-80);
  });
});

// ---------------------------------------------------------------------------
// computeS2F — pure function tests
// ---------------------------------------------------------------------------

describe('computeS2F', () => {
  it('returns valid S2F with note about invalidation', () => {
    const result = computeS2F(19_740_000, 0.83, 67000);
    expect(result.ratio).toBeGreaterThan(0);
    expect(result.modelPrice).toBeGreaterThan(0);
    expect(result.note).toContain('invalidated');
  });

  it('returns zero when inflation is 0', () => {
    const result = computeS2F(19_740_000, 0, 67000);
    expect(result.ratio).toBe(0);
    expect(result.modelPrice).toBe(0);
  });

  it('returns zero when totalMined is 0', () => {
    const result = computeS2F(0, 0.83, 67000);
    expect(result.ratio).toBe(0);
  });

  it('deviation is negative when price below model', () => {
    // With high S2F ratio the model price can be very high
    const result = computeS2F(19_740_000, 0.83, 100);
    expect(result.deviationPct).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// fetchNVTRatio — async with mocked fetch
// ---------------------------------------------------------------------------

describe('fetchNVTRatio', () => {
  it('returns NVT result on success', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockMarketCapChart))
      .mockResolvedValueOnce(jsonResponse(mockTxVolumeChart));

    const result = await fetchNVTRatio();
    expect(result.ratio).toBeGreaterThan(0);
    expect(['deeply_undervalued', 'undervalued', 'fair', 'overvalued', 'bubble']).toContain(
      result.signal,
    );
  });

  it('returns neutral on failure', async () => {
    mockFetch.mockResolvedValue(failResponse());

    const result = await fetchNVTRatio();
    expect(result.signal).toBe('fair');
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchMVRVZScore — async with mocked fetch
// ---------------------------------------------------------------------------

describe('fetchMVRVZScore', () => {
  it('returns MVRV result on success', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPriceChart3Y));

    const result = await fetchMVRVZScore();
    expect(Number.isFinite(result.zScore)).toBe(true);
    expect(['strong_buy', 'fair', 'expensive', 'near_top', 'extreme_overvaluation']).toContain(
      result.signal,
    );
  });

  it('returns neutral on failure', async () => {
    mockFetch.mockResolvedValue(failResponse());

    const result = await fetchMVRVZScore();
    expect(result.signal).toBe('fair');
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fetchSupplyDynamics
// ---------------------------------------------------------------------------

describe('fetchSupplyDynamics', () => {
  it('returns supply dynamics on success', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTotalBitcoinsChart))
      .mockResolvedValueOnce(jsonResponse(mockTxFeesChart))
      .mockResolvedValueOnce(jsonResponse(mockMinerRevenueChart));

    const result = await fetchSupplyDynamics();
    expect(result.percentMined).toBeGreaterThan(0);
    expect(result.percentMined).toBeLessThanOrEqual(100);
    expect(result.inflationRate).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('returns reasonable defaults when chart APIs fail', async () => {
    mockFetch.mockResolvedValue(failResponse());

    const result = await fetchSupplyDynamics();
    // When allSettled rejects all, defaults are used internally
    expect(result.percentMined).toBeGreaterThan(0);
    expect(result.percentMined).toBeLessThanOrEqual(100);
    expect(result.inflationRate).toBeGreaterThanOrEqual(0);
    expect(result.inflationRate).toBeLessThanOrEqual(10);
    expect(Number.isFinite(result.score)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchOnChainValuation — combined
// ---------------------------------------------------------------------------

describe('fetchOnChainValuation', () => {
  it('returns composite valuation', async () => {
    // NVT needs 2 chart calls, MVRV needs 1, supply needs 3
    mockFetch
      // NVT
      .mockResolvedValueOnce(jsonResponse(mockMarketCapChart))
      .mockResolvedValueOnce(jsonResponse(mockTxVolumeChart))
      // MVRV
      .mockResolvedValueOnce(jsonResponse(mockPriceChart3Y))
      // Supply dynamics
      .mockResolvedValueOnce(jsonResponse(mockTotalBitcoinsChart))
      .mockResolvedValueOnce(jsonResponse(mockTxFeesChart))
      .mockResolvedValueOnce(jsonResponse(mockMinerRevenueChart));

    const result = await fetchOnChainValuation();
    expect(['bullish', 'bearish', 'neutral']).toContain(result.composite.direction);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.s2f.note).toContain('informational');
  });

  it('returns valid result even when all APIs fail', async () => {
    mockFetch.mockResolvedValue(failResponse());

    const result = await fetchOnChainValuation();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    // All failures → neutral defaults
    expect(result.nvt.signal).toBe('fair');
    expect(result.mvrv.signal).toBe('fair');
  });

  it('no NaN or Infinity in output', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockMarketCapChart))
      .mockResolvedValueOnce(jsonResponse(mockTxVolumeChart))
      .mockResolvedValueOnce(jsonResponse(mockPriceChart3Y))
      .mockResolvedValueOnce(jsonResponse(mockTotalBitcoinsChart))
      .mockResolvedValueOnce(jsonResponse(mockTxFeesChart))
      .mockResolvedValueOnce(jsonResponse(mockMinerRevenueChart));

    const result = await fetchOnChainValuation();
    expect(Number.isFinite(result.composite.score)).toBe(true);
    expect(Number.isFinite(result.confidence)).toBe(true);
    expect(Number.isFinite(result.nvt.ratio)).toBe(true);
    expect(Number.isFinite(result.mvrv.zScore)).toBe(true);
  });
});
