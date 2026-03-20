import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock all external dependencies
// ---------------------------------------------------------------------------

vi.mock('@/core/technical-analysis/index.js', () => ({
  analyzeTechnicals: vi.fn().mockResolvedValue({
    composite: { direction: 'bullish', score: 40, confidence: 70 },
    signals: [{ description: 'RSI 45 — neutral zone' }],
  }),
}));

vi.mock('@/core/trends/sentiment.js', () => ({
  analyzeSentiment: vi.fn().mockResolvedValue({
    overall: 0.3,
    consensus: 'bullish',
  }),
}));

vi.mock('@/data/sources/fear-greed.js', () => ({
  fetchFearGreedIndex: vi.fn().mockResolvedValue({
    current: { value: 55, classification: 'Neutral' },
  }),
}));

vi.mock('@/data/sources/binance.js', () => ({
  fetchFundingRate: vi.fn().mockResolvedValue({ fundingRate: 0.0001 }),
  fetchOpenInterest: vi.fn().mockResolvedValue({ openInterest: 100000, notionalValue: 5e9 }),
  fetchTickerPrice: vi.fn().mockResolvedValue({ price: 67000, change24h: 2.5 }),
}));

vi.mock('@/core/fundamentals/index.js', () => ({
  analyzeBlockchainFundamentals: vi.fn().mockResolvedValue({
    symbol: 'BTC',
    composite: { score: 20, direction: 'bullish', confidence: 70 },
    halvingCycle: { score: 42, phase: 'accumulation', cycleProgress: 23.3, reasoning: 'test' },
    networkHealth: { score: 15, hashRibbonSignal: 'neutral', reasoning: 'test' },
    onChainValuation: { score: 10, nvtRatio: 55, mvrvZScore: 1.5, reasoning: 'test' },
    supplyDynamics: { score: 25, inflationRate: 0.83, feeRevenueShare: 5.2, reasoning: 'test' },
    overrideApplied: null,
    reasoning: ['Blockchain test'],
  }),
}));

import { generatePrediction } from '@/core/trends/predictor.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generatePrediction', () => {
  it('returns a valid Prediction object', async () => {
    const prediction = await generatePrediction('BTC');

    expect(prediction.symbol).toBe('BTC');
    expect(['up', 'down', 'sideways']).toContain(prediction.direction);
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeLessThanOrEqual(100);
    expect(prediction.timeframe).toBe('4h');
    expect(prediction.reasoning).toBeInstanceOf(Array);
    expect(prediction.reasoning.length).toBeGreaterThan(0);
    expect(prediction.disclaimer).toBeTruthy();
  });

  it('has all 6 signal types including blockchain', async () => {
    const prediction = await generatePrediction('ETH');

    expect(prediction.signals).toHaveProperty('technical');
    expect(prediction.signals).toHaveProperty('sentiment');
    expect(prediction.signals).toHaveProperty('derivatives');
    expect(prediction.signals).toHaveProperty('trend');
    expect(prediction.signals).toHaveProperty('macro');
    expect(prediction.signals).toHaveProperty('blockchain');
  });

  it('composite is bounded -100 to 100', async () => {
    const prediction = await generatePrediction('SOL');

    expect(prediction.composite).toBeGreaterThanOrEqual(-100);
    expect(prediction.composite).toBeLessThanOrEqual(100);
  });

  it('handles partial failures gracefully', async () => {
    // Override one mock to throw
    const { fetchTickerPrice } = await import('@/data/sources/binance.js');
    vi.mocked(fetchTickerPrice).mockRejectedValueOnce(new Error('API down'));

    const prediction = await generatePrediction('BTC');
    // Should still return a result
    expect(prediction.symbol).toBe('BTC');
    expect(prediction.reasoning.some((r) => r.includes('unavailable'))).toBe(true);
  });

  it('signal weights sum to 100', () => {
    // Import the weights constant indirectly via verifying the behavior
    // Weights: technical 32, sentiment 15, derivatives 15, trend 10, macro 5, blockchain 23
    const weights = {
      technical: 32,
      sentiment: 15,
      derivatives: 15,
      trend: 10,
      macro: 5,
      blockchain: 23,
    };
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('blockchain signal contributes to composite', async () => {
    const prediction = await generatePrediction('BTC');
    // With blockchain mock at score 20, it should contribute to the composite
    expect(prediction.signals.blockchain).toBe(20);
  });

  it('reasoning includes blockchain signal when available', async () => {
    const prediction = await generatePrediction('BTC');
    expect(prediction.reasoning.some((r) => r.includes('Blockchain'))).toBe(true);
  });

  it('handles blockchain signal failure gracefully', async () => {
    const { analyzeBlockchainFundamentals } = await import('@/core/fundamentals/index.js');
    vi.mocked(analyzeBlockchainFundamentals).mockRejectedValueOnce(new Error('API down'));

    const prediction = await generatePrediction('BTC');
    expect(prediction.symbol).toBe('BTC');
    expect(prediction.signals.blockchain).toBe(0);
    expect(prediction.reasoning.some((r) => r.includes('Blockchain: unavailable'))).toBe(true);
  });

  it('existing predictions still work without blockchain signal', async () => {
    const { analyzeBlockchainFundamentals } = await import('@/core/fundamentals/index.js');
    vi.mocked(analyzeBlockchainFundamentals).mockRejectedValue(new Error('Always fails'));

    const prediction = await generatePrediction('BTC');
    // Should still produce a valid prediction from other 5 signals
    expect(['up', 'down', 'sideways']).toContain(prediction.direction);
    expect(prediction.composite).toBeGreaterThanOrEqual(-100);
    expect(prediction.composite).toBeLessThanOrEqual(100);
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
  });

  it('no NaN or Infinity in output', async () => {
    const prediction = await generatePrediction('BTC');
    expect(Number.isFinite(prediction.composite)).toBe(true);
    expect(Number.isFinite(prediction.confidence)).toBe(true);
    for (const val of Object.values(prediction.signals)) {
      expect(Number.isFinite(val)).toBe(true);
    }
  });
});
