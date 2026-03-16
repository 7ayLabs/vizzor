import { describe, it, expect } from 'vitest';
import {
  calculateRSI,
  calculateEMA,
  calculateSMA,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateOBV,
} from '@/core/technical-analysis/indicators.js';

// ---------------------------------------------------------------------------
// Sample data — 30 days of synthetic close prices
// ---------------------------------------------------------------------------

const closes = [
  100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113, 115, 117, 116, 118,
  120, 119, 121, 123, 122, 124, 126, 125, 127, 129, 128,
];

const highs = closes.map((c) => c + 2);
const lows = closes.map((c) => c - 2);
const volumes = closes.map(() => 1000 + Math.random() * 500);

// ---------------------------------------------------------------------------
// RSI
// ---------------------------------------------------------------------------

describe('calculateRSI', () => {
  it('returns null when insufficient data', () => {
    expect(calculateRSI([1, 2, 3], 14)).toBeNull();
  });

  it('returns a value between 0 and 100', () => {
    const rsi = calculateRSI(closes);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThanOrEqual(0);
    expect(rsi!).toBeLessThanOrEqual(100);
  });

  it('returns 100 when price only goes up', () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = calculateRSI(rising);
    expect(rsi).toBe(100);
  });

  it('returns low RSI when price only goes down', () => {
    const falling = Array.from({ length: 20 }, (_, i) => 200 - i);
    const rsi = calculateRSI(falling);
    expect(rsi).not.toBeNull();
    expect(rsi!).toBeLessThan(10);
  });

  it('respects custom period', () => {
    const rsi7 = calculateRSI(closes, 7);
    const rsi14 = calculateRSI(closes, 14);
    expect(rsi7).not.toBeNull();
    expect(rsi14).not.toBeNull();
    // Different periods produce different values
    expect(rsi7).not.toBe(rsi14);
  });
});

// ---------------------------------------------------------------------------
// EMA
// ---------------------------------------------------------------------------

describe('calculateEMA', () => {
  it('returns empty array when insufficient data', () => {
    expect(calculateEMA([1, 2], 5)).toEqual([]);
  });

  it('returns values with correct length', () => {
    const ema = calculateEMA(closes, 12);
    // EMA starts at index (period - 1), so length = data.length - period + 1
    expect(ema).toHaveLength(closes.length - 12 + 1);
  });

  it('first value equals SMA of first N items', () => {
    const period = 5;
    const ema = calculateEMA(closes, period);
    const smaFirst = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    expect(ema[0]).toBeCloseTo(smaFirst);
  });
});

// ---------------------------------------------------------------------------
// SMA
// ---------------------------------------------------------------------------

describe('calculateSMA', () => {
  it('returns empty array when insufficient data', () => {
    expect(calculateSMA([1, 2], 5)).toEqual([]);
  });

  it('calculates correct simple averages', () => {
    const sma = calculateSMA([10, 20, 30, 40, 50], 3);
    expect(sma[0]).toBeCloseTo(20); // (10+20+30)/3
    expect(sma[1]).toBeCloseTo(30); // (20+30+40)/3
    expect(sma[2]).toBeCloseTo(40); // (30+40+50)/3
  });

  it('returns correct length', () => {
    const sma = calculateSMA(closes, 20);
    expect(sma).toHaveLength(closes.length - 20 + 1);
  });
});

// ---------------------------------------------------------------------------
// MACD
// ---------------------------------------------------------------------------

describe('calculateMACD', () => {
  it('returns null when insufficient data', () => {
    expect(calculateMACD(closes.slice(0, 10))).toBeNull();
  });

  it('returns macd, signal, and histogram', () => {
    // Need enough data: slowPeriod + signalPeriod = 26 + 9 = 35
    const longData = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const result = calculateMACD(longData);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('macd');
    expect(result).toHaveProperty('signal');
    expect(result).toHaveProperty('histogram');
    expect(result!.histogram).toBeCloseTo(result!.macd - result!.signal);
  });
});

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

describe('calculateBollingerBands', () => {
  it('returns null when insufficient data', () => {
    expect(calculateBollingerBands([1, 2, 3])).toBeNull();
  });

  it('returns upper > middle > lower', () => {
    const bb = calculateBollingerBands(closes);
    expect(bb).not.toBeNull();
    expect(bb!.upper).toBeGreaterThan(bb!.middle);
    expect(bb!.middle).toBeGreaterThan(bb!.lower);
  });

  it('percentB is between 0 and 1 for normal prices', () => {
    const bb = calculateBollingerBands(closes);
    expect(bb).not.toBeNull();
    expect(bb!.percentB).toBeGreaterThanOrEqual(-0.5);
    expect(bb!.percentB).toBeLessThanOrEqual(1.5);
  });
});

// ---------------------------------------------------------------------------
// ATR
// ---------------------------------------------------------------------------

describe('calculateATR', () => {
  it('returns null when insufficient data', () => {
    expect(calculateATR([1], [1], [1])).toBeNull();
  });

  it('returns a positive value', () => {
    const atr = calculateATR(highs, lows, closes);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });

  it('ATR is at least the average high-low range', () => {
    const atr = calculateATR(highs, lows, closes);
    // highs are c+2, lows are c-2, so range is always 4
    expect(atr!).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// OBV
// ---------------------------------------------------------------------------

describe('calculateOBV', () => {
  it('returns null when insufficient data', () => {
    expect(calculateOBV([1], [100])).toBeNull();
  });

  it('returns a number for valid data', () => {
    const obv = calculateOBV(closes, volumes);
    expect(obv).not.toBeNull();
    expect(typeof obv).toBe('number');
  });

  it('OBV increases when prices consistently rise', () => {
    const rising = [100, 101, 102, 103, 104];
    const vol = [1000, 1000, 1000, 1000, 1000];
    const obv = calculateOBV(rising, vol);
    expect(obv!).toBe(4000); // 4 up moves * 1000
  });

  it('OBV decreases when prices consistently fall', () => {
    const falling = [104, 103, 102, 101, 100];
    const vol = [1000, 1000, 1000, 1000, 1000];
    const obv = calculateOBV(falling, vol);
    expect(obv!).toBe(-4000);
  });
});
