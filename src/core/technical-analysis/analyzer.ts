/* eslint-disable @typescript-eslint/no-non-null-assertion */
// ---------------------------------------------------------------------------
// Technical analysis analyzer — runs all indicators on kline data
// ---------------------------------------------------------------------------

import { fetchKlines } from '../../data/sources/binance.js';
import type { TechnicalAnalysis, TechnicalSignal, SignalDirection } from './types.js';
import {
  calculateRSI,
  calculateEMA,
  calculateSMA,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateOBV,
} from './indicators.js';
import { getMLClient } from '../../ml/client.js';

/**
 * Run full technical analysis on a symbol using Binance kline data.
 */
export async function analyzeTechnicals(
  symbol: string,
  timeframe = '4h',
): Promise<TechnicalAnalysis> {
  const klines = await fetchKlines(symbol, timeframe, 100);

  const closes = klines.map((k) => k.close);
  const highs = klines.map((k) => k.high);
  const lows = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);

  const signals: TechnicalSignal[] = [];

  // RSI
  const rsi = calculateRSI(closes);
  if (rsi !== null) {
    signals.push(interpretRSI(rsi));
  }

  // MACD
  const macd = calculateMACD(closes);
  if (macd !== null) {
    signals.push(interpretMACD(macd));
  }

  // Bollinger Bands
  const bb = calculateBollingerBands(closes);
  if (bb !== null) {
    signals.push(interpretBollinger(bb, closes[closes.length - 1]!));
  }

  // EMA crossover
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  if (ema12.length > 0 && ema26.length > 0) {
    signals.push(interpretEMACrossover(ema12[ema12.length - 1]!, ema26[ema26.length - 1]!));
  }

  // ATR
  const atr = calculateATR(highs, lows, closes);
  if (atr !== null) {
    const currentPrice = closes[closes.length - 1]!;
    signals.push(interpretATR(atr, currentPrice));
  }

  // OBV
  const obv = calculateOBV(closes, volumes);
  if (obv !== null) {
    // Compare OBV direction with price direction
    const priceChange =
      closes.length >= 2 ? closes[closes.length - 1]! - closes[closes.length - 2]! : 0;
    signals.push(interpretOBV(obv, priceChange));
  }

  // SMA
  const sma20 = calculateSMA(closes, 20);

  const currentPrice = closes[closes.length - 1]!;
  const prevPrice = closes.length >= 2 ? closes[closes.length - 2]! : currentPrice;
  const priceChange = currentPrice - prevPrice;
  const ema12Val = ema12.length > 0 ? ema12[ema12.length - 1]! : 0;
  const ema26Val = ema26.length > 0 ? ema26[ema26.length - 1]! : 0;
  const emaCrossPct = ema26Val !== 0 ? ((ema12Val - ema26Val) / ema26Val) * 100 : 0;
  const atrPct = atr !== null && currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  const bbBandwidth = bb !== null && bb.middle > 0 ? ((bb.upper - bb.lower) / bb.middle) * 100 : 0;

  // ML: try ML TA interpreter for signals + weights + composite
  const mlClient = getMLClient();
  if (mlClient) {
    try {
      const mlResult = await mlClient.interpretTA({
        rsi: rsi ?? 50,
        macd_histogram: macd?.histogram ?? 0,
        macd_line: macd?.macd ?? 0,
        macd_signal: macd?.signal ?? 0,
        bb_percent_b: bb?.percentB ?? 0.5,
        bb_bandwidth: bbBandwidth,
        ema12: ema12Val,
        ema26: ema26Val,
        ema_cross_pct: emaCrossPct,
        atr: atr ?? 0,
        atr_pct: atrPct,
        obv: obv ?? 0,
        price_change: priceChange,
      });
      if (mlResult) {
        // Map ML signals to TechnicalSignal format
        const mlSignals: TechnicalSignal[] = mlResult.signals.map((s) => ({
          name: s.name,
          value: 0,
          signal: s.direction as SignalDirection,
          strength: s.strength,
          description: s.description,
        }));

        return {
          symbol: symbol.toUpperCase(),
          timeframe,
          signals: mlSignals,
          composite: {
            direction: mlResult.composite.direction as SignalDirection,
            score: mlResult.composite.score,
            confidence: mlResult.composite.confidence,
          },
          indicators: {
            rsi: rsi,
            macd: macd,
            bollingerBands: bb,
            ema12: ema12Val || null,
            ema26: ema26Val || null,
            sma20: sma20.length > 0 ? sma20[sma20.length - 1]! : null,
            atr: atr,
            obv: obv,
          },
          timestamp: Date.now(),
        };
      }
    } catch {
      // ML unavailable — fall through to rule-based
    }
  }

  // Composite score: weighted average of signal strengths
  const composite = calculateComposite(signals);

  return {
    symbol: symbol.toUpperCase(),
    timeframe,
    signals,
    composite,
    indicators: {
      rsi: rsi,
      macd: macd,
      bollingerBands: bb,
      ema12: ema12Val || null,
      ema26: ema26Val || null,
      sma20: sma20.length > 0 ? sma20[sma20.length - 1]! : null,
      atr: atr,
      obv: obv,
    },
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Signal interpretation
// ---------------------------------------------------------------------------

const WEIGHTS: Record<string, number> = {
  RSI: 20,
  MACD: 20,
  'Bollinger Bands': 15,
  'EMA Crossover': 20,
  ATR: 10,
  OBV: 15,
};

function interpretRSI(rsi: number): TechnicalSignal {
  let signal: SignalDirection;
  let strength: number;
  let description: string;

  if (rsi > 70) {
    signal = 'bearish';
    strength = Math.min(100, 50 + (rsi - 70) * 1.5);
    description = `RSI ${rsi.toFixed(1)} — overbought territory, potential pullback`;
  } else if (rsi < 30) {
    signal = 'bullish';
    strength = Math.min(100, 50 + (30 - rsi) * 1.5);
    description = `RSI ${rsi.toFixed(1)} — oversold territory, potential bounce`;
  } else if (rsi > 60) {
    signal = 'bullish';
    strength = 40 + (rsi - 60);
    description = `RSI ${rsi.toFixed(1)} — bullish momentum`;
  } else if (rsi < 40) {
    signal = 'bearish';
    strength = 40 + (40 - rsi);
    description = `RSI ${rsi.toFixed(1)} — bearish momentum`;
  } else {
    signal = 'neutral';
    strength = 30;
    description = `RSI ${rsi.toFixed(1)} — neutral zone`;
  }

  return { name: 'RSI', value: rsi, signal, strength, description };
}

function interpretMACD(macd: { macd: number; signal: number; histogram: number }): TechnicalSignal {
  const { histogram } = macd;
  let signal: SignalDirection;
  let strength: number;
  let description: string;

  if (histogram > 0) {
    signal = 'bullish';
    strength = Math.min(90, 50 + Math.abs(histogram) * 100);
    description = `MACD histogram positive (${histogram.toFixed(4)}) — bullish momentum`;
  } else if (histogram < 0) {
    signal = 'bearish';
    strength = Math.min(90, 50 + Math.abs(histogram) * 100);
    description = `MACD histogram negative (${histogram.toFixed(4)}) — bearish momentum`;
  } else {
    signal = 'neutral';
    strength = 30;
    description = 'MACD at signal line — no clear direction';
  }

  // Crossover detection
  if (macd.macd > macd.signal && histogram > 0 && histogram < 0.001) {
    description += ' (fresh bullish crossover)';
    strength = Math.min(100, strength + 20);
  } else if (macd.macd < macd.signal && histogram < 0 && histogram > -0.001) {
    description += ' (fresh bearish crossover)';
    strength = Math.min(100, strength + 20);
  }

  return { name: 'MACD', value: histogram, signal, strength, description };
}

function interpretBollinger(
  bb: { upper: number; middle: number; lower: number; percentB: number },
  price: number,
): TechnicalSignal {
  const { percentB } = bb;
  let signal: SignalDirection;
  let strength: number;
  let description: string;

  if (percentB > 1) {
    signal = 'bullish';
    strength = 70;
    description = `Price above upper Bollinger Band (%B: ${percentB.toFixed(2)}) — strong breakout`;
  } else if (percentB > 0.8) {
    signal = 'bearish';
    strength = 55;
    description = `Price near upper band (%B: ${percentB.toFixed(2)}) — extended, potential pullback`;
  } else if (percentB < 0) {
    signal = 'bearish';
    strength = 70;
    description = `Price below lower Bollinger Band (%B: ${percentB.toFixed(2)}) — breakdown`;
  } else if (percentB < 0.2) {
    signal = 'bullish';
    strength = 55;
    description = `Price near lower band (%B: ${percentB.toFixed(2)}) — compressed, potential bounce`;
  } else {
    signal = 'neutral';
    strength = 30;
    description = `Price within bands (%B: ${percentB.toFixed(2)}) at $${price.toLocaleString()}`;
  }

  return { name: 'Bollinger Bands', value: percentB, signal, strength, description };
}

function interpretEMACrossover(ema12: number, ema26: number): TechnicalSignal {
  const diff = ema12 - ema26;
  const pctDiff = ema26 !== 0 ? (diff / ema26) * 100 : 0;
  let signal: SignalDirection;
  let strength: number;
  let description: string;

  if (diff > 0) {
    signal = 'bullish';
    strength = Math.min(90, 50 + Math.abs(pctDiff) * 10);
    description = `EMA(12) above EMA(26) by ${pctDiff.toFixed(2)}% — bullish trend`;
  } else if (diff < 0) {
    signal = 'bearish';
    strength = Math.min(90, 50 + Math.abs(pctDiff) * 10);
    description = `EMA(12) below EMA(26) by ${Math.abs(pctDiff).toFixed(2)}% — bearish trend`;
  } else {
    signal = 'neutral';
    strength = 30;
    description = 'EMA(12) = EMA(26) — no trend';
  }

  return { name: 'EMA Crossover', value: pctDiff, signal, strength, description };
}

function interpretATR(atr: number, price: number): TechnicalSignal {
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  let description: string;

  if (atrPct > 5) {
    description = `ATR ${atrPct.toFixed(2)}% of price — high volatility, breakout conditions`;
  } else if (atrPct > 2) {
    description = `ATR ${atrPct.toFixed(2)}% of price — moderate volatility`;
  } else {
    description = `ATR ${atrPct.toFixed(2)}% of price — low volatility, consolidation`;
  }

  return { name: 'ATR', value: atr, signal: 'neutral', strength: 40, description };
}

function interpretOBV(obv: number, priceChange: number): TechnicalSignal {
  let signal: SignalDirection;
  let strength: number;
  let description: string;

  if (obv > 0 && priceChange > 0) {
    signal = 'bullish';
    strength = 65;
    description = 'OBV positive with rising price — confirmed uptrend';
  } else if (obv > 0 && priceChange <= 0) {
    signal = 'bullish';
    strength = 70;
    description = 'OBV positive but price flat/down — accumulation (bullish divergence)';
  } else if (obv < 0 && priceChange < 0) {
    signal = 'bearish';
    strength = 65;
    description = 'OBV negative with falling price — confirmed downtrend';
  } else if (obv < 0 && priceChange >= 0) {
    signal = 'bearish';
    strength = 70;
    description = 'OBV negative but price flat/up — distribution (bearish divergence)';
  } else {
    signal = 'neutral';
    strength = 30;
    description = 'OBV neutral';
  }

  return { name: 'OBV', value: obv, signal, strength, description };
}

function calculateComposite(signals: TechnicalSignal[]): {
  direction: SignalDirection;
  score: number;
  confidence: number;
} {
  if (signals.length === 0) {
    return { direction: 'neutral', score: 0, confidence: 0 };
  }

  let totalWeight = 0;
  let weightedScore = 0;

  for (const sig of signals) {
    const weight = WEIGHTS[sig.name] ?? 10;
    totalWeight += weight;

    const dirScore =
      sig.signal === 'bullish' ? sig.strength : sig.signal === 'bearish' ? -sig.strength : 0;
    weightedScore += dirScore * weight;
  }

  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

  // Confidence based on signal agreement
  const bullishCount = signals.filter((s) => s.signal === 'bullish').length;
  const bearishCount = signals.filter((s) => s.signal === 'bearish').length;
  const totalDirectional = bullishCount + bearishCount;
  const agreement =
    totalDirectional > 0 ? Math.max(bullishCount, bearishCount) / totalDirectional : 0;
  const confidence = Math.round(agreement * 100 * (signals.length / 6)); // scale by completeness

  const direction: SignalDirection = score > 15 ? 'bullish' : score < -15 ? 'bearish' : 'neutral';

  return {
    direction,
    score: Math.round(score),
    confidence: Math.min(100, confidence),
  };
}
