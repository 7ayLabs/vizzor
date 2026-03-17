// ---------------------------------------------------------------------------
// Feature Engineering — transforms TA + agent signals into ML feature vectors
// ---------------------------------------------------------------------------

import { analyzeTechnicals } from '../core/technical-analysis/index.js';
import { fetchFundingRate, fetchTickerPrice, fetchKlines } from '../data/sources/binance.js';
import { fetchFearGreedIndex } from '../data/sources/fear-greed.js';
import { calculateRSI } from '../core/technical-analysis/indicators.js';
import type { FeatureVector, BlockchainCycleMLFeatures } from './types.js';

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

/**
 * Build a feature vector for blockchain cycle ML analysis.
 * Gathers on-chain data from blockchain-info and onchain-metrics sources.
 */
export async function buildBlockchainFeatureVector(): Promise<BlockchainCycleMLFeatures> {
  const { fetchBitcoinNetworkStats, fetchBitcoinSupplyStats, fetchBitcoinMiningStats } =
    await import('../data/sources/blockchain-info.js');
  const { fetchNVTRatio, fetchMVRVZScore, fetchSupplyDynamics } =
    await import('../data/sources/onchain-metrics.js');
  const { analyzeHalvingCycle, computeHashRibbon } =
    await import('../core/fundamentals/blockchain-analyzer.js');

  const [networkResult, supplyResult, miningResult, nvtResult, mvrvResult, supplyDynResult] =
    await Promise.allSettled([
      fetchBitcoinNetworkStats(),
      fetchBitcoinSupplyStats(),
      fetchBitcoinMiningStats(),
      fetchNVTRatio(),
      fetchMVRVZScore(),
      fetchSupplyDynamics(),
    ]);

  const network = networkResult.status === 'fulfilled' ? networkResult.value : null;
  const supply = supplyResult.status === 'fulfilled' ? supplyResult.value : null;
  const mining = miningResult.status === 'fulfilled' ? miningResult.value : null;
  const nvt = nvtResult.status === 'fulfilled' ? nvtResult.value : null;
  const mvrv = mvrvResult.status === 'fulfilled' ? mvrvResult.value : null;
  const supplyDyn = supplyDynResult.status === 'fulfilled' ? supplyDynResult.value : null;

  const blockHeight = network?.blockHeight ?? 0;
  const halving = blockHeight > 0 ? analyzeHalvingCycle(blockHeight) : null;
  const hashRibbon = network ? computeHashRibbon(network.hashrate, network.hashrate * 0.98) : null;

  return {
    halving_cycle_progress: halving?.cycleProgress ?? 0,
    days_since_halving: halving?.daysInCycle ?? 0,
    days_to_next_halving: halving?.daysToNextHalving ?? 0,
    block_reward: supply?.blockReward ?? 0,
    hashrate_change_30d: mining?.difficultyAdjustmentPct ?? 0,
    difficulty_change_14d: mining?.difficultyAdjustmentPct ?? 0,
    nvt_ratio: nvt?.ratio ?? 0,
    mvrv_z_score: mvrv?.zScore ?? 0,
    inflation_rate: supplyDyn?.inflationRate ?? 0,
    fee_revenue_share: supplyDyn?.feeRevenueShare ?? 0,
    mempool_size_mb: (network?.mempoolTxCount ?? 0) * 0.0004, // rough estimate
    avg_fee_rate: mining?.avgFeeRate ?? 0,
    hash_ribbon_signal:
      hashRibbon?.signal === 'capitulation' ? -1 : hashRibbon?.signal === 'golden_cross' ? 1 : 0,
  };
}
