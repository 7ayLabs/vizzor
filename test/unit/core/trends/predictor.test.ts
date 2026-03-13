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
    expect(prediction.timeframe).toBe('7 days');
    expect(prediction.reasoning).toBeInstanceOf(Array);
    expect(prediction.reasoning.length).toBeGreaterThan(0);
    expect(prediction.disclaimer).toBeTruthy();
  });

  it('has all 5 signal types', async () => {
    const prediction = await generatePrediction('ETH');

    expect(prediction.signals).toHaveProperty('technical');
    expect(prediction.signals).toHaveProperty('sentiment');
    expect(prediction.signals).toHaveProperty('derivatives');
    expect(prediction.signals).toHaveProperty('trend');
    expect(prediction.signals).toHaveProperty('macro');
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
});
