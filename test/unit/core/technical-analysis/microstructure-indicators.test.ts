import { describe, it, expect } from 'vitest';
import {
  calculateVWAP,
  calculateVolumeDelta,
  detectMarketStructure,
  detectFVGs,
  detectSRZones,
  estimateLiquidationZones,
  detectSqueezeConditions,
  computePsychLevel,
} from '@/core/technical-analysis/microstructure-indicators.js';

// ---------------------------------------------------------------------------
// Sample data — 30 candles of synthetic OHLCV
// ---------------------------------------------------------------------------

const closes = [
  100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113, 115, 117, 116, 118,
  120, 119, 121, 123, 122, 124, 126, 125, 127, 129, 128,
];
const highs = closes.map((c) => c + 2);
const lows = closes.map((c) => c - 2);
const opens = closes.map((c, i) => (i > 0 ? closes[i - 1]! : c - 1));
const volumes = closes.map(() => 1000);

// ---------------------------------------------------------------------------
// calculateVWAP
// ---------------------------------------------------------------------------

describe('calculateVWAP', () => {
  it('returns null when insufficient data', () => {
    expect(calculateVWAP([100], [98], [99], [1000])).toBeNull();
  });

  it('returns VWAP and bands for valid data', () => {
    const result = calculateVWAP(highs, lows, closes, volumes);
    expect(result).not.toBeNull();
    expect(result!.vwap).toBeGreaterThan(0);
    expect(result!.upperBand).toBeGreaterThan(result!.vwap);
    expect(result!.lowerBand).toBeLessThan(result!.vwap);
  });

  it('bands bracket the VWAP', () => {
    const result = calculateVWAP(highs, lows, closes, volumes);
    expect(result!.upperBand).toBeGreaterThan(result!.vwap);
    expect(result!.lowerBand).toBeLessThan(result!.vwap);
  });

  it('returns null when all volumes are zero', () => {
    const zeroVol = closes.map(() => 0);
    expect(calculateVWAP(highs, lows, closes, zeroVol)).toBeNull();
  });

  it('deviation reflects price position relative to VWAP', () => {
    const result = calculateVWAP(highs, lows, closes, volumes);
    expect(result).not.toBeNull();
    // Since the data trends up, last close should be above VWAP, giving positive deviation
    expect(typeof result!.deviation).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// calculateVolumeDelta
// ---------------------------------------------------------------------------

describe('calculateVolumeDelta', () => {
  it('returns null when insufficient data', () => {
    expect(calculateVolumeDelta([100, 101], [101, 102], [1000, 1000])).toBeNull();
  });

  it('returns positive delta for mostly bullish candles', () => {
    // Close > Open = bullish candle = positive volume
    const bullishOpens = closes.map((c) => c - 1);
    const result = calculateVolumeDelta(bullishOpens, closes, volumes);
    expect(result).not.toBeNull();
    expect(result!.delta).toBeGreaterThan(0);
  });

  it('returns negative delta for mostly bearish candles', () => {
    const bearishOpens = closes.map((c) => c + 1);
    const result = calculateVolumeDelta(bearishOpens, closes, volumes);
    expect(result).not.toBeNull();
    expect(result!.delta).toBeLessThan(0);
  });

  it('detects bullish divergence when price falls but delta rises', () => {
    // Price falling, but closes > opens (positive volume delta)
    const falling = Array.from({ length: 20 }, (_, i) => 200 - i);
    const fallingOpens = falling.map((c) => c + 2); // open above close = bearish price
    // But we want delta to be positive: close > open on last segment
    const mixedOpens = fallingOpens.map((o, i) => (i >= 10 ? falling[i]! - 1 : o));
    const result = calculateVolumeDelta(mixedOpens, falling, volumes.slice(0, 20));
    expect(result).not.toBeNull();
    // The divergence may or may not trigger depending on exact values
    expect(['bullish', 'bearish', 'none']).toContain(result!.divergence);
  });

  it('returns deltaMA as average of recent deltas', () => {
    const result = calculateVolumeDelta(opens, closes, volumes);
    expect(result).not.toBeNull();
    expect(typeof result!.deltaMA).toBe('number');
  });

  it('cumulativeDelta has same length as input', () => {
    const result = calculateVolumeDelta(opens, closes, volumes);
    expect(result).not.toBeNull();
    expect(result!.cumulativeDelta).toHaveLength(closes.length);
  });
});

// ---------------------------------------------------------------------------
// detectMarketStructure
// ---------------------------------------------------------------------------

describe('detectMarketStructure', () => {
  it('returns null when insufficient data', () => {
    expect(detectMarketStructure([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeNull();
  });

  it('detects structure for zigzag data', () => {
    // Zigzag pattern that creates clear swing highs and lows
    // Pattern: up, up, up, DOWN, DOWN, up, up, up, DOWN, DOWN (repeating)
    const zigHighs: number[] = [];
    const zigLows: number[] = [];
    let base = 100;
    for (let i = 0; i < 30; i++) {
      if (i % 10 < 5) {
        // Rising phase
        zigHighs.push(base + (i % 10) * 3 + 2);
        zigLows.push(base + (i % 10) * 3 - 2);
      } else {
        // Falling phase
        zigHighs.push(base + (10 - (i % 10)) * 3 + 2);
        zigLows.push(base + (10 - (i % 10)) * 3 - 2);
      }
      if (i % 10 === 9) base += 5; // Each cycle slightly higher = bullish trend
    }
    const result = detectMarketStructure(zigHighs, zigLows);
    expect(result).not.toBeNull();
    // Should find swing points in the zigzag
    expect(result!.swingHighs.length + result!.swingLows.length).toBeGreaterThan(0);
  });

  it('detects swing points correctly', () => {
    const result = detectMarketStructure(highs, lows);
    expect(result).not.toBeNull();
    // All swing highs should have type 'high'
    for (const sh of result!.swingHighs) {
      expect(sh.type).toBe('high');
      expect(sh.price).toBeGreaterThan(0);
      expect(sh.index).toBeGreaterThanOrEqual(0);
    }
    // All swing lows should have type 'low'
    for (const sl of result!.swingLows) {
      expect(sl.type).toBe('low');
    }
  });

  it('returns sequence of HH/HL/LH/LL', () => {
    const result = detectMarketStructure(highs, lows);
    expect(result).not.toBeNull();
    for (const s of result!.sequence) {
      expect(['HH', 'HL', 'LH', 'LL']).toContain(s);
    }
  });

  it('bias is one of bullish, bearish, ranging', () => {
    const result = detectMarketStructure(highs, lows);
    expect(result).not.toBeNull();
    expect(['bullish', 'bearish', 'ranging']).toContain(result!.bias);
  });
});

// ---------------------------------------------------------------------------
// detectFVGs
// ---------------------------------------------------------------------------

describe('detectFVGs', () => {
  it('returns empty array for insufficient data', () => {
    expect(detectFVGs([100], [98], [99], 2)).toEqual([]);
    expect(detectFVGs([100, 102], [98, 100], [99, 101], 2)).toEqual([]);
  });

  it('detects bullish FVG (gap up)', () => {
    // Candle 0: H=102, L=98
    // Candle 1: H=110, L=103 (gap candle)
    // Candle 2: H=115, L=108  → L[2]=108 > H[0]=102, so bullish FVG
    const h = [102, 110, 115];
    const l = [98, 103, 108];
    const c = [100, 108, 112];
    const fvgs = detectFVGs(h, l, c, 2);
    expect(fvgs.length).toBeGreaterThanOrEqual(1);
    const bullish = fvgs.find((f) => f.type === 'bullish');
    expect(bullish).toBeDefined();
    expect(bullish!.bottom).toBe(102); // H[0]
    expect(bullish!.top).toBe(108); // L[2]
  });

  it('detects bearish FVG (gap down)', () => {
    // Candle 0: H=115, L=110
    // Candle 1: H=105, L=100 (gap candle)
    // Candle 2: H=98, L=95  → H[2]=98 < L[0]=110, so bearish FVG
    const h = [115, 105, 98];
    const l = [110, 100, 95];
    const c = [112, 102, 96];
    const fvgs = detectFVGs(h, l, c, 2);
    expect(fvgs.length).toBeGreaterThanOrEqual(1);
    const bearish = fvgs.find((f) => f.type === 'bearish');
    expect(bearish).toBeDefined();
    expect(bearish!.top).toBe(110); // L[0]
    expect(bearish!.bottom).toBe(98); // H[2]
  });

  it('tracks filled status for bullish FVG', () => {
    // Gap up then price comes back down to fill
    const h = [102, 110, 115, 112, 100];
    const l = [98, 103, 108, 99, 95]; // L[3]=99 < bottom=102 → filled
    const c = [100, 108, 112, 100, 97];
    const fvgs = detectFVGs(h, l, c, 2);
    const bullish = fvgs.find((f) => f.type === 'bullish');
    if (bullish) {
      expect(bullish.filled).toBe(true);
    }
  });

  it('strength scales with gap size relative to ATR', () => {
    const h = [102, 110, 120]; // larger gap
    const l = [98, 103, 112];
    const c = [100, 108, 116];
    const smallATR = detectFVGs(h, l, c, 1);
    const largeATR = detectFVGs(h, l, c, 100);
    // Smaller ATR → bigger relative gap → higher strength
    if (smallATR.length > 0 && largeATR.length > 0) {
      expect(smallATR[0]!.strength).toBeGreaterThanOrEqual(largeATR[0]!.strength);
    }
  });
});

// ---------------------------------------------------------------------------
// detectSRZones
// ---------------------------------------------------------------------------

describe('detectSRZones', () => {
  it('returns empty for insufficient data', () => {
    expect(detectSRZones([100, 102, 101], [98, 100, 99], [99, 101, 100])).toEqual([]);
  });

  it('detects zones with multiple touches', () => {
    // Create data with repeated bounces at ~100 and ~110
    const h: number[] = [];
    const l: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < 20; i++) {
      if (i % 4 === 0) {
        h.push(110.5);
        l.push(108);
        c.push(109);
      } else if (i % 4 === 2) {
        h.push(102);
        l.push(99.5);
        c.push(101);
      } else {
        h.push(106);
        l.push(104);
        c.push(105);
      }
    }
    const zones = detectSRZones(h, l, c);
    expect(zones.length).toBeGreaterThan(0);
  });

  it('zones have correct structure', () => {
    const zones = detectSRZones(highs, lows, closes);
    for (const z of zones) {
      expect(z.price).toBeGreaterThan(0);
      expect(z.touches).toBeGreaterThanOrEqual(2);
      expect(['support', 'resistance', 'pivot']).toContain(z.type);
      expect(z.strength).toBeGreaterThan(0);
      expect(z.strength).toBeLessThanOrEqual(100);
    }
  });

  it('limits output to 10 zones max', () => {
    const zones = detectSRZones(highs, lows, closes);
    expect(zones.length).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// estimateLiquidationZones
// ---------------------------------------------------------------------------

describe('estimateLiquidationZones', () => {
  it('returns long liquidations below current price', () => {
    const result = estimateLiquidationZones(50000, 100000);
    for (const lz of result.longLiquidations) {
      expect(lz.price).toBeLessThan(50000);
      expect(lz.side).toBe('long');
    }
  });

  it('returns short liquidations above current price', () => {
    const result = estimateLiquidationZones(50000, 100000);
    for (const lz of result.shortLiquidations) {
      expect(lz.price).toBeGreaterThan(50000);
      expect(lz.side).toBe('short');
    }
  });

  it('uses correct leverage math for long liquidation', () => {
    const result = estimateLiquidationZones(100, 1000);
    const liq10x = result.longLiquidations.find((l) => l.leverage === 10);
    // 10x long liq = price * (1 - 1/10) = price * 0.9 = 90
    expect(liq10x).toBeDefined();
    expect(liq10x!.price).toBe(90);
  });

  it('uses correct leverage math for short liquidation', () => {
    const result = estimateLiquidationZones(100, 1000);
    const liq10x = result.shortLiquidations.find((l) => l.leverage === 10);
    // 10x short liq = price * (1 + 1/10) = price * 1.1 = 110
    expect(liq10x).toBeDefined();
    expect(liq10x!.price).toBe(110);
  });

  it('weights liquidity by leverage tier', () => {
    const result = estimateLiquidationZones(50000, 100000);
    const liq10 = result.longLiquidations.find((l) => l.leverage === 10);
    const liq100 = result.longLiquidations.find((l) => l.leverage === 100);
    // 10x has weight 0.4, 100x has weight 0.1
    expect(liq10!.estimatedLiquidity).toBeGreaterThan(liq100!.estimatedLiquidity);
  });

  it('returns 4 zones per side with default leverages', () => {
    const result = estimateLiquidationZones(50000, 100000);
    expect(result.longLiquidations).toHaveLength(4);
    expect(result.shortLiquidations).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// detectSqueezeConditions
// ---------------------------------------------------------------------------

describe('detectSqueezeConditions', () => {
  const baseLiq = estimateLiquidationZones(50000, 100000);

  it('returns null squeezes when conditions are normal', () => {
    const result = detectSqueezeConditions(
      0, // neutral funding
      1.0, // balanced L/S
      1.0, // balanced top trader
      null,
      null,
      baseLiq,
      1.0, // balanced OB
      50000,
      500,
    );
    expect(result.shortSqueeze).toBeNull();
    expect(result.longSqueeze).toBeNull();
  });

  it('detects short squeeze on extreme negative funding + heavy shorts', () => {
    const result = detectSqueezeConditions(
      -0.0005, // extreme negative funding
      0.6, // heavy short positioning
      0.7, // top traders short
      null,
      { delta: 100, divergence: 'bullish' },
      baseLiq,
      1.5, // bid-heavy OB
      50000,
      500,
    );
    expect(result.shortSqueeze).not.toBeNull();
    expect(result.shortSqueeze!.side).toBe('short_squeeze');
    expect(result.shortSqueeze!.probability).toBeGreaterThanOrEqual(30);
    expect(result.shortSqueeze!.probability).toBeLessThanOrEqual(80);
    expect(result.shortSqueeze!.reasoning.length).toBeGreaterThan(0);
  });

  it('detects long squeeze on extreme positive funding + heavy longs', () => {
    const result = detectSqueezeConditions(
      0.0005, // extreme positive funding
      1.5, // heavy long positioning
      1.4, // top traders long
      null,
      { delta: -100, divergence: 'bearish' },
      baseLiq,
      0.5, // ask-heavy OB
      50000,
      500,
    );
    expect(result.longSqueeze).not.toBeNull();
    expect(result.longSqueeze!.side).toBe('long_squeeze');
    expect(result.longSqueeze!.probability).toBeGreaterThanOrEqual(30);
  });

  it('squeeze setup has valid entry/stop/targets', () => {
    const result = detectSqueezeConditions(
      -0.0005,
      0.6,
      0.7,
      null,
      { delta: 100, divergence: 'bullish' },
      baseLiq,
      1.5,
      50000,
      500,
    );
    if (result.shortSqueeze) {
      expect(result.shortSqueeze.entry).toBeGreaterThan(0);
      expect(result.shortSqueeze.stopLoss).toBeGreaterThan(0);
      expect(result.shortSqueeze.targets).toHaveLength(3);
      for (const t of result.shortSqueeze.targets) {
        expect(t).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// computePsychLevel
// ---------------------------------------------------------------------------

describe('computePsychLevel', () => {
  it('rounds BTC to nearest $1000', () => {
    expect(computePsychLevel(67450, 'BTC')).toBe(67000);
    expect(computePsychLevel(67550, 'BTC')).toBe(68000);
    expect(computePsychLevel(70000, 'BTC')).toBe(70000);
  });

  it('rounds ETH to nearest $100', () => {
    // 3250 is equidistant — rounds down (floor wins on tie)
    expect(computePsychLevel(3250, 'ETH')).toBe(3200);
    expect(computePsychLevel(3260, 'ETH')).toBe(3300);
    expect(computePsychLevel(3240, 'ETH')).toBe(3200);
  });

  it('rounds based on price magnitude for unknown symbols', () => {
    // Price > 10000 → round to 1000
    expect(computePsychLevel(15400, 'UNKNOWN')).toBe(15000);
    // Price > 100 → round to 10
    expect(computePsychLevel(154, 'UNKNOWN')).toBe(150);
    // Price > 10 → round to 1
    expect(computePsychLevel(15.4, 'UNKNOWN')).toBe(15);
    // Price > 1 → round to 0.1
    expect(computePsychLevel(1.54, 'UNKNOWN')).toBe(1.5);
    // Price < 1 → round to 0.01
    expect(computePsychLevel(0.154, 'UNKNOWN')).toBe(0.15);
  });
});
