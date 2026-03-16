/* eslint-disable @typescript-eslint/no-non-null-assertion */
// ---------------------------------------------------------------------------
// Microstructure indicators — pure math, no API calls, no side effects
// Array indexing uses non-null assertions after bounds checks for performance.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StructureType = 'HH' | 'HL' | 'LH' | 'LL';
export type MarketBias = 'bullish' | 'bearish' | 'ranging';

export interface SwingPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
}

export interface MarketStructure {
  bias: MarketBias;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  sequence: StructureType[];
  lastBreak: { type: 'BOS' | 'CHoCH'; price: number; index: number } | null;
}

export interface FairValueGap {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  midpoint: number;
  index: number;
  filled: boolean;
  strength: number; // 0-100
}

export interface SRZone {
  price: number;
  strength: number; // 0-100
  type: 'support' | 'resistance' | 'pivot';
  touches: number;
}

export interface LiquidationZone {
  price: number;
  leverage: number;
  side: 'long' | 'short';
  estimatedLiquidity: number; // relative weight
}

export interface SqueezeSetup {
  side: 'short_squeeze' | 'long_squeeze';
  trappedZone: [number, number];
  breakoutLevel: number;
  cascadeStart: number;
  entry: number;
  stopLoss: number;
  targets: [number, number, number];
  probability: number; // 30-80
  reasoning: string[];
}

// ---------------------------------------------------------------------------
// 1. VWAP — Volume-Weighted Average Price
// ---------------------------------------------------------------------------

export function calculateVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): { vwap: number; upperBand: number; lowerBand: number; deviation: number } | null {
  const n = Math.min(highs.length, lows.length, closes.length, volumes.length);
  if (n < 2) return null;

  let cumulativeTPV = 0;
  let cumulativeVol = 0;
  const tpArray: number[] = [];

  for (let i = 0; i < n; i++) {
    const tp = (highs[i]! + lows[i]! + closes[i]!) / 3;
    tpArray.push(tp);
    cumulativeTPV += tp * volumes[i]!;
    cumulativeVol += volumes[i]!;
  }

  if (cumulativeVol === 0) return null;

  const vwap = cumulativeTPV / cumulativeVol;

  // Standard deviation from VWAP
  let sumSqDev = 0;
  for (let i = 0; i < n; i++) {
    sumSqDev += Math.pow(tpArray[i]! - vwap, 2) * volumes[i]!;
  }
  const stddev = Math.sqrt(sumSqDev / cumulativeVol);

  const currentPrice = closes[n - 1]!;
  const deviation = vwap !== 0 ? ((currentPrice - vwap) / vwap) * 100 : 0;

  return {
    vwap,
    upperBand: vwap + stddev,
    lowerBand: vwap - stddev,
    deviation,
  };
}

// ---------------------------------------------------------------------------
// 2. Volume Delta — cumulative buy/sell volume
// ---------------------------------------------------------------------------

export function calculateVolumeDelta(
  opens: number[],
  closes: number[],
  volumes: number[],
): {
  delta: number;
  cumulativeDelta: number[];
  deltaMA: number;
  divergence: 'bullish' | 'bearish' | 'none';
} | null {
  const n = Math.min(opens.length, closes.length, volumes.length);
  if (n < 5) return null;

  const cumulativeDelta: number[] = [];
  let cumDelta = 0;
  const perCandle: number[] = [];

  for (let i = 0; i < n; i++) {
    const d = closes[i]! > opens[i]! ? volumes[i]! : closes[i]! < opens[i]! ? -volumes[i]! : 0;
    perCandle.push(d);
    cumDelta += d;
    cumulativeDelta.push(cumDelta);
  }

  // SMA(5) of per-candle delta
  const maPeriod = Math.min(5, n);
  let maSum = 0;
  for (let i = n - maPeriod; i < n; i++) maSum += perCandle[i]!;
  const deltaMA = maSum / maPeriod;

  // Divergence detection: compare price direction vs cumDelta direction over last 10 candles
  const lookback = Math.min(10, n - 1);
  const priceChange = closes[n - 1]! - closes[n - 1 - lookback]!;
  const deltaChange = cumulativeDelta[n - 1]! - cumulativeDelta[n - 1 - lookback]!;

  let divergence: 'bullish' | 'bearish' | 'none' = 'none';
  if (priceChange > 0 && deltaChange < 0) divergence = 'bearish';
  else if (priceChange < 0 && deltaChange > 0) divergence = 'bullish';

  return { delta: cumDelta, cumulativeDelta, deltaMA, divergence };
}

// ---------------------------------------------------------------------------
// 3. Market Structure — swing points, HH/HL/LH/LL, BOS/CHoCH
// ---------------------------------------------------------------------------

export function detectMarketStructure(
  highs: number[],
  lows: number[],
  lookback = 5,
): MarketStructure | null {
  const n = Math.min(highs.length, lows.length);
  if (n < lookback * 2 + 1) return null;

  const swingHighs: SwingPoint[] = [];
  const swingLows: SwingPoint[] = [];

  // Pivot detection — check if highs[i] is higher than all neighbors within lookback
  for (let i = lookback; i < n - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (highs[i]! <= highs[i - j]! || highs[i]! <= highs[i + j]!) isHigh = false;
      if (lows[i]! >= lows[i - j]! || lows[i]! >= lows[i + j]!) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: highs[i]!, type: 'high' });
    if (isLow) swingLows.push({ index: i, price: lows[i]!, type: 'low' });
  }

  // Build HH/HL/LH/LL sequence
  const sequence: StructureType[] = [];

  for (let i = 1; i < swingHighs.length; i++) {
    sequence.push(swingHighs[i]!.price > swingHighs[i - 1]!.price ? 'HH' : 'LH');
  }
  for (let i = 1; i < swingLows.length; i++) {
    sequence.push(swingLows[i]!.price > swingLows[i - 1]!.price ? 'HL' : 'LL');
  }

  // Determine bias from recent structure
  const recentSeq = sequence.slice(-4);
  const hhCount = recentSeq.filter((s) => s === 'HH' || s === 'HL').length;
  const llCount = recentSeq.filter((s) => s === 'LH' || s === 'LL').length;

  let bias: MarketBias = 'ranging';
  if (hhCount >= 3) bias = 'bullish';
  else if (llCount >= 3) bias = 'bearish';

  // Detect last break (BOS or CHoCH)
  let lastBreak: MarketStructure['lastBreak'] = null;
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastHigh = swingHighs[swingHighs.length - 1]!;
    const prevHigh = swingHighs[swingHighs.length - 2]!;
    const lastLow = swingLows[swingLows.length - 1]!;
    const prevLow = swingLows[swingLows.length - 2]!;

    // BOS = price breaks the last swing in the direction of the trend
    // CHoCH = price breaks the last swing AGAINST the trend
    if (bias === 'bullish' && lastLow.price < prevLow.price) {
      lastBreak = { type: 'CHoCH', price: prevLow.price, index: lastLow.index };
    } else if (bias === 'bearish' && lastHigh.price > prevHigh.price) {
      lastBreak = { type: 'CHoCH', price: prevHigh.price, index: lastHigh.index };
    } else if (bias === 'bullish' && lastHigh.price > prevHigh.price) {
      lastBreak = { type: 'BOS', price: prevHigh.price, index: lastHigh.index };
    } else if (bias === 'bearish' && lastLow.price < prevLow.price) {
      lastBreak = { type: 'BOS', price: prevLow.price, index: lastLow.index };
    }
  }

  return { bias, swingHighs, swingLows, sequence, lastBreak };
}

// ---------------------------------------------------------------------------
// 4. Fair Value Gaps (FVG)
// ---------------------------------------------------------------------------

export function detectFVGs(
  highs: number[],
  lows: number[],
  closes: number[],
  atr: number | null,
): FairValueGap[] {
  const n = Math.min(highs.length, lows.length, closes.length);
  if (n < 3) return [];

  const fvgs: FairValueGap[] = [];

  for (let i = 1; i < n - 1; i++) {
    // Bullish FVG: candle i+1 low > candle i-1 high (gap up)
    if (lows[i + 1]! > highs[i - 1]!) {
      const top = lows[i + 1]!;
      const bottom = highs[i - 1]!;
      const gapSize = top - bottom;
      const strength = atr && atr > 0 ? Math.min(100, (gapSize / atr) * 50) : 50;

      // Check if filled by subsequent price action
      let filled = false;
      for (let j = i + 2; j < n; j++) {
        if (lows[j]! <= bottom) {
          filled = true;
          break;
        }
      }

      fvgs.push({
        type: 'bullish',
        top,
        bottom,
        midpoint: (top + bottom) / 2,
        index: i,
        filled,
        strength,
      });
    }

    // Bearish FVG: candle i+1 high < candle i-1 low (gap down)
    if (highs[i + 1]! < lows[i - 1]!) {
      const top = lows[i - 1]!;
      const bottom = highs[i + 1]!;
      const gapSize = top - bottom;
      const strength = atr && atr > 0 ? Math.min(100, (gapSize / atr) * 50) : 50;

      let filled = false;
      for (let j = i + 2; j < n; j++) {
        if (highs[j]! >= top) {
          filled = true;
          break;
        }
      }

      fvgs.push({
        type: 'bearish',
        top,
        bottom,
        midpoint: (top + bottom) / 2,
        index: i,
        filled,
        strength,
      });
    }
  }

  // Return only unfilled FVGs first, then filled, most recent first
  return fvgs
    .sort((a, b) => {
      if (a.filled !== b.filled) return a.filled ? 1 : -1;
      return b.index - a.index;
    })
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// 5. Support/Resistance Zone Detection
// ---------------------------------------------------------------------------

export function detectSRZones(
  highs: number[],
  lows: number[],
  closes: number[],
  tolerance = 0.003,
): SRZone[] {
  const n = Math.min(highs.length, lows.length, closes.length);
  if (n < 10) return [];

  // Collect all swing points (simple 3-bar pivot)
  const pivots: { price: number; type: 'high' | 'low' }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (highs[i]! > highs[i - 1]! && highs[i]! > highs[i + 1]!) {
      pivots.push({ price: highs[i]!, type: 'high' });
    }
    if (lows[i]! < lows[i - 1]! && lows[i]! < lows[i + 1]!) {
      pivots.push({ price: lows[i]!, type: 'low' });
    }
  }

  if (pivots.length === 0) return [];

  // Cluster pivots within tolerance
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const zones: { price: number; touches: number; highTouches: number; lowTouches: number }[] = [];
  let cluster = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const refPrice = cluster[0]!.price;
    if (Math.abs(sorted[i]!.price - refPrice) / refPrice <= tolerance) {
      cluster.push(sorted[i]!);
    } else {
      if (cluster.length >= 2) {
        const avg = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
        const highT = cluster.filter((p) => p.type === 'high').length;
        const lowT = cluster.filter((p) => p.type === 'low').length;
        zones.push({ price: avg, touches: cluster.length, highTouches: highT, lowTouches: lowT });
      }
      cluster = [sorted[i]!];
    }
  }
  // Don't forget last cluster
  if (cluster.length >= 2) {
    const avg = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
    const highT = cluster.filter((p) => p.type === 'high').length;
    const lowT = cluster.filter((p) => p.type === 'low').length;
    zones.push({ price: avg, touches: cluster.length, highTouches: highT, lowTouches: lowT });
  }

  const currentPrice = closes[n - 1]!;

  return zones
    .map((z) => {
      let type: 'support' | 'resistance' | 'pivot';
      if (z.lowTouches > z.highTouches && z.price < currentPrice) type = 'support';
      else if (z.highTouches > z.lowTouches && z.price > currentPrice) type = 'resistance';
      else type = 'pivot';

      return {
        price: Math.round(z.price * 100) / 100,
        strength: Math.min(100, z.touches * 20),
        type,
        touches: z.touches,
      };
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// 6. Estimated Liquidation Zones
// ---------------------------------------------------------------------------

export function estimateLiquidationZones(
  currentPrice: number,
  openInterest: number,
  leverages: number[] = [10, 25, 50, 100],
): { longLiquidations: LiquidationZone[]; shortLiquidations: LiquidationZone[] } {
  // OI distribution estimate: most volume at lower leverage
  const leverageWeights: Record<number, number> = { 10: 0.4, 25: 0.3, 50: 0.2, 100: 0.1 };
  const longLiquidations: LiquidationZone[] = [];
  const shortLiquidations: LiquidationZone[] = [];

  for (const lev of leverages) {
    const weight = leverageWeights[lev] ?? 0.1;
    const liqAmount = openInterest * weight;

    // Long liquidation = price drops enough to wipe out margin
    const longLiqPrice = currentPrice * (1 - 1 / lev);
    longLiquidations.push({
      price: Math.round(longLiqPrice * 100) / 100,
      leverage: lev,
      side: 'long',
      estimatedLiquidity: Math.round(liqAmount),
    });

    // Short liquidation = price rises enough to wipe out margin
    const shortLiqPrice = currentPrice * (1 + 1 / lev);
    shortLiquidations.push({
      price: Math.round(shortLiqPrice * 100) / 100,
      leverage: lev,
      side: 'short',
      estimatedLiquidity: Math.round(liqAmount),
    });
  }

  return {
    longLiquidations: longLiquidations.sort((a, b) => b.price - a.price), // closest to price first
    shortLiquidations: shortLiquidations.sort((a, b) => a.price - b.price), // closest to price first
  };
}

// ---------------------------------------------------------------------------
// 7. Squeeze Detection
// ---------------------------------------------------------------------------

export function detectSqueezeConditions(
  fundingRate: number | null,
  longShortRatio: number | null,
  topTraderRatio: number | null,
  structure: MarketStructure | null,
  volumeDelta: { delta: number; divergence: string } | null,
  liqZones: { longLiquidations: LiquidationZone[]; shortLiquidations: LiquidationZone[] } | null,
  obImbalance: number | null,
  currentPrice: number,
  atr: number | null,
): { shortSqueeze: SqueezeSetup | null; longSqueeze: SqueezeSetup | null } {
  const buffer = atr ?? currentPrice * 0.005;
  let shortSqueeze: SqueezeSetup | null = null;
  let longSqueeze: SqueezeSetup | null = null;

  // Short squeeze conditions: extreme negative funding + many shorts + breakout potential
  {
    const reasons: string[] = [];
    let score = 0;

    if (fundingRate !== null && fundingRate < -0.0001) {
      reasons.push(`Negative funding (${(fundingRate * 100).toFixed(4)}%) — shorts paying longs`);
      score += 20;
    }
    if (longShortRatio !== null && longShortRatio < 0.8) {
      reasons.push(`L/S ratio ${longShortRatio.toFixed(2)} — heavy short positioning`);
      score += 15;
    }
    if (topTraderRatio !== null && topTraderRatio < 0.9) {
      reasons.push(`Top traders net short (${topTraderRatio.toFixed(2)})`);
      score += 10;
    }
    if (volumeDelta?.divergence === 'bullish') {
      reasons.push('Bullish volume delta divergence — hidden buying');
      score += 15;
    }
    if (obImbalance !== null && obImbalance > 1.3) {
      reasons.push(`Order book bid-heavy (${obImbalance.toFixed(2)}) — institutional absorption`);
      score += 10;
    }
    if (structure?.lastBreak?.type === 'CHoCH' && structure.bias === 'bearish') {
      reasons.push('CHoCH detected in bearish structure — potential reversal');
      score += 10;
    }

    if (score >= 30 && liqZones) {
      const nearestShortLiq = liqZones.shortLiquidations[0];
      const breakout = nearestShortLiq ? nearestShortLiq.price : currentPrice * 1.02;
      const cascade = liqZones.shortLiquidations[1]?.price ?? breakout * 1.01;

      shortSqueeze = {
        side: 'short_squeeze',
        trappedZone: [currentPrice - buffer, currentPrice],
        breakoutLevel: Math.round(breakout * 100) / 100,
        cascadeStart: Math.round(cascade * 100) / 100,
        entry: Math.round((currentPrice + buffer * 0.3) * 100) / 100,
        stopLoss: Math.round((currentPrice - buffer * 1.5) * 100) / 100,
        targets: [
          Math.round((breakout + buffer) * 100) / 100,
          Math.round((cascade + buffer) * 100) / 100,
          Math.round((cascade + buffer * 3) * 100) / 100,
        ],
        probability: Math.min(80, Math.max(30, score)),
        reasoning: reasons,
      };
    }
  }

  // Long squeeze conditions: extreme positive funding + many longs + breakdown potential
  {
    const reasons: string[] = [];
    let score = 0;

    if (fundingRate !== null && fundingRate > 0.0001) {
      reasons.push(`Positive funding (${(fundingRate * 100).toFixed(4)}%) — longs paying shorts`);
      score += 20;
    }
    if (longShortRatio !== null && longShortRatio > 1.3) {
      reasons.push(`L/S ratio ${longShortRatio.toFixed(2)} — heavy long positioning`);
      score += 15;
    }
    if (topTraderRatio !== null && topTraderRatio > 1.2) {
      reasons.push(`Top traders net long (${topTraderRatio.toFixed(2)})`);
      score += 10;
    }
    if (volumeDelta?.divergence === 'bearish') {
      reasons.push('Bearish volume delta divergence — hidden selling');
      score += 15;
    }
    if (obImbalance !== null && obImbalance < 0.7) {
      reasons.push(`Order book ask-heavy (${obImbalance.toFixed(2)}) — institutional distribution`);
      score += 10;
    }
    if (structure?.lastBreak?.type === 'CHoCH' && structure.bias === 'bullish') {
      reasons.push('CHoCH detected in bullish structure — potential reversal');
      score += 10;
    }

    if (score >= 30 && liqZones) {
      const nearestLongLiq = liqZones.longLiquidations[0];
      const breakdown = nearestLongLiq ? nearestLongLiq.price : currentPrice * 0.98;
      const cascade = liqZones.longLiquidations[1]?.price ?? breakdown * 0.99;

      longSqueeze = {
        side: 'long_squeeze',
        trappedZone: [currentPrice, currentPrice + buffer],
        breakoutLevel: Math.round(breakdown * 100) / 100,
        cascadeStart: Math.round(cascade * 100) / 100,
        entry: Math.round((currentPrice - buffer * 0.3) * 100) / 100,
        stopLoss: Math.round((currentPrice + buffer * 1.5) * 100) / 100,
        targets: [
          Math.round((breakdown - buffer) * 100) / 100,
          Math.round((cascade - buffer) * 100) / 100,
          Math.round((cascade - buffer * 3) * 100) / 100,
        ],
        probability: Math.min(80, Math.max(30, score)),
        reasoning: reasons,
      };
    }
  }

  return { shortSqueeze, longSqueeze };
}

// ---------------------------------------------------------------------------
// 8. Psychological Level Detection
// ---------------------------------------------------------------------------

export function computePsychLevel(price: number, symbol: string): number {
  const upper = symbol.toUpperCase();

  // Different rounding based on asset price magnitude
  let round: number;
  if (upper === 'BTC' || price > 10000) round = 1000;
  else if (upper === 'ETH' || price > 1000) round = 100;
  else if (price > 100) round = 10;
  else if (price > 10) round = 1;
  else if (price > 1) round = 0.1;
  else round = 0.01;

  // Return nearest round number
  const below = Math.floor(price / round) * round;
  const above = Math.ceil(price / round) * round;
  return Math.abs(price - below) <= Math.abs(price - above) ? below : above;
}
