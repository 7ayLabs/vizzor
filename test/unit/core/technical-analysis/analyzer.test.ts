import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock binance — factory must not reference outer variables
vi.mock('@/data/sources/binance.js', () => ({
  fetchKlines: vi.fn(),
}));

import { analyzeTechnicals } from '@/core/technical-analysis/analyzer.js';
import { fetchKlines } from '@/data/sources/binance.js';

// ---------------------------------------------------------------------------
// Generate synthetic klines
// ---------------------------------------------------------------------------

function makeKlines(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    open: 100 + Math.sin(i / 5) * 10,
    high: 105 + Math.sin(i / 5) * 10,
    low: 95 + Math.sin(i / 5) * 10,
    close: 102 + Math.sin(i / 5) * 10,
    volume: 1000 + i * 10,
    openTime: Date.now() - (count - i) * 3600000,
    closeTime: Date.now() - (count - i - 1) * 3600000,
    trades: 500,
  }));
}

beforeEach(() => {
  vi.mocked(fetchKlines).mockReset();
});

describe('analyzeTechnicals', () => {
  it('returns a full TechnicalAnalysis object', async () => {
    vi.mocked(fetchKlines).mockResolvedValueOnce(makeKlines(100));

    const result = await analyzeTechnicals('BTC', '4h');

    expect(result.symbol).toBe('BTC');
    expect(result.timeframe).toBe('4h');
    expect(result.signals).toBeInstanceOf(Array);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.composite).toHaveProperty('direction');
    expect(result.composite).toHaveProperty('score');
    expect(result.composite).toHaveProperty('confidence');
    expect(result.indicators).toHaveProperty('rsi');
    expect(result.indicators).toHaveProperty('macd');
    expect(result.indicators).toHaveProperty('bollingerBands');
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('composite direction is bullish, bearish, or neutral', async () => {
    vi.mocked(fetchKlines).mockResolvedValueOnce(makeKlines(100));

    const result = await analyzeTechnicals('ETH');
    expect(['bullish', 'bearish', 'neutral']).toContain(result.composite.direction);
  });

  it('all signals have required fields', async () => {
    vi.mocked(fetchKlines).mockResolvedValueOnce(makeKlines(100));

    const result = await analyzeTechnicals('SOL', '1h');
    for (const signal of result.signals) {
      expect(signal).toHaveProperty('name');
      expect(signal).toHaveProperty('value');
      expect(signal).toHaveProperty('signal');
      expect(signal).toHaveProperty('strength');
      expect(signal).toHaveProperty('description');
      expect(['bullish', 'bearish', 'neutral']).toContain(signal.signal);
      expect(signal.strength).toBeGreaterThanOrEqual(0);
      expect(signal.strength).toBeLessThanOrEqual(100);
    }
  });

  it('confidence is between 0 and 100', async () => {
    vi.mocked(fetchKlines).mockResolvedValueOnce(makeKlines(100));

    const result = await analyzeTechnicals('BTC');
    expect(result.composite.confidence).toBeGreaterThanOrEqual(0);
    expect(result.composite.confidence).toBeLessThanOrEqual(100);
  });
});
