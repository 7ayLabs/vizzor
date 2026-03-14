/* eslint-disable @typescript-eslint/no-non-null-assertion */
// ---------------------------------------------------------------------------
// Pure math indicators — no API calls, no side effects
// Array indexing uses non-null assertions after bounds checks for performance.
// ---------------------------------------------------------------------------

/**
 * Calculate RSI (Relative Strength Index).
 * RSI = 100 - (100 / (1 + avgGain / avgLoss))
 */
export function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial averages
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth with Wilder's method
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate Exponential Moving Average.
 */
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // SMA for the first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i]!;
  }
  ema.push(sum / period);

  // EMA for subsequent values
  for (let i = period; i < values.length; i++) {
    const prev = ema[ema.length - 1]!;
    ema.push((values[i]! - prev) * multiplier + prev);
  }

  return ema;
}

/**
 * Calculate Simple Moving Average.
 */
export function calculateSMA(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const sma: number[] = [];
  let sum = 0;

  for (let i = 0; i < period; i++) {
    sum += values[i]!;
  }
  sma.push(sum / period);

  for (let i = period; i < values.length; i++) {
    sum = sum - values[i - period]! + values[i]!;
    sma.push(sum / period);
  }

  return sma;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence).
 * Returns { macd, signal, histogram } for the latest value.
 */
export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < slowPeriod + signalPeriod) return null;

  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  // Align EMAs — fast EMA starts at index (fastPeriod-1), slow at (slowPeriod-1)
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset]! - slowEMA[i]!);
  }

  if (macdLine.length < signalPeriod) return null;

  const signalLine = calculateEMA(macdLine, signalPeriod);
  const lastMacd = macdLine[macdLine.length - 1]!;
  const lastSignal = signalLine[signalLine.length - 1]!;

  return {
    macd: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
  };
}

/**
 * Calculate Bollinger Bands.
 * Returns { upper, middle, lower, percentB } for the latest value.
 */
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2,
): { upper: number; middle: number; lower: number; percentB: number } | null {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;

  const variance = slice.reduce((sum, val) => sum + (val - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const current = closes[closes.length - 1]!;
  const percentB = upper !== lower ? (current - lower) / (upper - lower) : 0.5;

  return { upper, middle, lower, percentB };
}

/**
 * Calculate Average True Range (ATR).
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  const len = Math.min(highs.length, lows.length, closes.length);
  if (len < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < len; i++) {
    const tr = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) return null;

  // Initial ATR is simple average
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i]!;
  }
  atr /= period;

  // Smooth with Wilder's method
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]!) / period;
  }

  return atr;
}

/**
 * Calculate On-Balance Volume (OBV).
 * Returns the final OBV value.
 */
export function calculateOBV(closes: number[], volumes: number[]): number | null {
  const len = Math.min(closes.length, volumes.length);
  if (len < 2) return null;

  let obv = 0;
  for (let i = 1; i < len; i++) {
    if (closes[i]! > closes[i - 1]!) {
      obv += volumes[i]!;
    } else if (closes[i]! < closes[i - 1]!) {
      obv -= volumes[i]!;
    }
    // if equal, obv stays the same
  }

  return obv;
}
