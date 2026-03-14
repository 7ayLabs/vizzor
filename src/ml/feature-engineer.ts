// ---------------------------------------------------------------------------
// Feature Engineering — transforms TA + agent signals into ML feature vectors
// ---------------------------------------------------------------------------

import { analyzeTechnicals } from '../core/technical-analysis/index.js';
import { fetchFundingRate, fetchTickerPrice, fetchKlines } from '../data/sources/binance.js';
import { fetchFearGreedIndex } from '../data/sources/fear-greed.js';
import { calculateRSI } from '../core/technical-analysis/indicators.js';
import type { FeatureVector } from './types.js';

export async function buildFeatureVector(symbol: string): Promise<FeatureVector> {
  // Gather all data in parallel
  const [ta, fundingResult, tickerResult, fgResult, klines] = await Promise.allSettled([
    analyzeTechnicals(symbol, '4h'),
    fetchFundingRate(symbol),
    fetchTickerPrice(symbol),
    fetchFearGreedIndex(1),
    fetchKlines(symbol, '4h', 100),
  ]);

  const indicators = ta.status === 'fulfilled' ? ta.value.indicators : null;
  const funding = fundingResult.status === 'fulfilled' ? fundingResult.value : null;
  const ticker = tickerResult.status === 'fulfilled' ? tickerResult.value : null;
  const fg = fgResult.status === 'fulfilled' ? fgResult.value : null;
  const candles = klines.status === 'fulfilled' ? klines.value : [];

  // RSI slope: rate of change over last 3 periods
  let rsiSlope = 0;
  if (candles.length >= 17) {
    const closes = candles.map((k) => k.close);
    const recentRsi = calculateRSI(closes, 14);
    const olderCloses = closes.slice(0, -3);
    const olderRsi = calculateRSI(olderCloses, 14);
    if (recentRsi !== null && olderRsi !== null) {
      rsiSlope = recentRsi - olderRsi;
    }
  }

  // Volume ratio: current / 20-period avg
  let volumeRatio = 1;
  if (candles.length >= 21) {
    const currentVolume = candles[candles.length - 1].volume;
    const avgVolume = candles.slice(-21, -1).reduce((sum, k) => sum + k.volume, 0) / 20;
    volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;
  }

  // EMA crossover %
  const price = ticker?.price ?? candles[candles.length - 1]?.close ?? 0;
  const ema12 = indicators?.ema12 ?? 0;
  const ema26 = indicators?.ema26 ?? 0;
  const emaCrossoverPct = price > 0 ? ((ema12 - ema26) / price) * 100 : 0;

  // ATR as % of price
  const atr = indicators?.atr ?? 0;
  const atrPct = price > 0 ? (atr / price) * 100 : 0;

  return {
    rsi: indicators?.rsi ?? 50,
    macdHistogram: indicators?.macd?.histogram ?? 0,
    bollingerPercentB: indicators?.bollingerBands?.percentB ?? 0.5,
    ema12,
    ema26,
    atr,
    obv: indicators?.obv ?? 0,
    fundingRate: funding?.fundingRate ?? 0,
    fearGreed: fg?.current.value ?? 50,
    priceChange24h: ticker?.change24h ?? 0,
    rsiSlope,
    volumeRatio,
    emaCrossoverPct,
    atrPct,
    symbol: symbol.toUpperCase(),
    timestamp: Date.now(),
  };
}
