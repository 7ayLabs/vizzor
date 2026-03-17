// ---------------------------------------------------------------------------
// On-chain valuation metrics — NVT, MVRV Z-Score, S2F, Supply Dynamics
// Sources: blockchain.info charts API (free), CoinGecko (already integrated)
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('onchain-metrics');

const BLOCKCHAIN_INFO_URL = 'https://blockchain.info';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const MarketCapSchema = z.number().min(0).max(1e16); // max $10 quadrillion
const TxVolumeSchema = z.number().min(0);

const ChartDataPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const ChartResponseSchema = z.object({
  values: z.array(ChartDataPointSchema),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NVTResult {
  ratio: number;
  signal: 'deeply_undervalued' | 'undervalued' | 'fair' | 'overvalued' | 'bubble';
  score: number;
}

export interface MVRVResult {
  zScore: number;
  signal: 'strong_buy' | 'fair' | 'expensive' | 'near_top' | 'extreme_overvaluation';
  score: number;
}

export interface S2FResult {
  ratio: number;
  modelPrice: number;
  deviationPct: number;
  note: string;
}

export interface SupplyDynamicsResult {
  percentMined: number;
  inflationRate: number;
  feeRevenueShare: number;
  score: number;
}

export interface OnChainValuationResult {
  nvt: NVTResult;
  mvrv: MVRVResult;
  s2f: S2FResult;
  supplyDynamics: SupplyDynamicsResult;
  composite: { score: number; direction: 'bullish' | 'bearish' | 'neutral' };
  confidence: number;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchChartData(
  chartName: string,
  timespan = '30days',
): Promise<{ x: number; y: number }[]> {
  const res = await fetch(
    `${BLOCKCHAIN_INFO_URL}/charts/${chartName}?timespan=${timespan}&format=json`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) throw new Error(`blockchain.info chart API error: ${res.status} ${res.statusText}`);
  const raw = await res.json();
  const parsed = ChartResponseSchema.parse(raw);
  return parsed.values;
}

// ---------------------------------------------------------------------------
// NVT Ratio — Network Value to Transactions
// Post-ETF adjusted thresholds
// ---------------------------------------------------------------------------

export function scoreNVT(nvtRatio: number): NVTResult {
  let signal: NVTResult['signal'];
  let score: number;

  if (nvtRatio < 30) {
    signal = 'deeply_undervalued';
    score = 50;
  } else if (nvtRatio < 45) {
    signal = 'undervalued';
    score = 25;
  } else if (nvtRatio <= 70) {
    signal = 'fair';
    score = 0;
  } else if (nvtRatio <= 90) {
    signal = 'overvalued';
    score = -25;
  } else {
    signal = 'bubble';
    score = -50;
  }

  return { ratio: nvtRatio, signal, score };
}

export async function fetchNVTRatio(): Promise<NVTResult> {
  try {
    // Market cap and transaction volume from blockchain.info charts
    const [marketCapData, txVolumeData] = await Promise.all([
      fetchChartData('market-cap', '5days'),
      fetchChartData('estimated-transaction-volume-usd', '5days'),
    ]);

    const latestCap = marketCapData[marketCapData.length - 1];
    const latestVolume = txVolumeData[txVolumeData.length - 1];

    if (!latestCap || !latestVolume) {
      throw new Error('No chart data available');
    }

    const marketCap = MarketCapSchema.parse(latestCap.y);
    const txVolume = TxVolumeSchema.parse(latestVolume.y);

    if (txVolume <= 0) {
      return { ratio: 999, signal: 'bubble', score: -50 };
    }

    const nvtRatio = marketCap / txVolume;
    return scoreNVT(nvtRatio);
  } catch (err) {
    log.debug(`NVT fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    // Return neutral on failure
    return { ratio: 0, signal: 'fair', score: 0 };
  }
}

// ---------------------------------------------------------------------------
// MVRV Z-Score — Market Value to Realized Value proxy
// Uses price vs 200-week SMA as proxy for realized price
// ---------------------------------------------------------------------------

export function scoreMVRV(zScore: number): MVRVResult {
  let signal: MVRVResult['signal'];
  let score: number;

  if (zScore < 0) {
    signal = 'strong_buy';
    score = 60;
  } else if (zScore <= 2) {
    signal = 'fair';
    score = 20;
  } else if (zScore <= 5) {
    signal = 'expensive';
    score = -20;
  } else if (zScore <= 7) {
    signal = 'near_top';
    score = -50;
  } else {
    signal = 'extreme_overvaluation';
    score = -80;
  }

  return { zScore, signal, score };
}

export async function fetchMVRVZScore(): Promise<MVRVResult> {
  try {
    // Get ~3 years of price data to compute 200-week SMA
    const priceData = await fetchChartData('market-price', '3years');

    if (priceData.length < 100) {
      throw new Error('Insufficient price history for MVRV calculation');
    }

    const prices = priceData.map((p) => p.y);
    const currentPrice = prices[prices.length - 1];

    // 200-week SMA ≈ 1400 daily data points
    // Use all available data as long-term average proxy
    const longTermAvg = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    if (longTermAvg <= 0 || currentPrice <= 0) {
      return { zScore: 0, signal: 'fair', score: 0 };
    }

    // Standard deviation of prices
    const variance =
      prices.reduce((sum, p) => sum + Math.pow(p - longTermAvg, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);

    // Z-Score = (current - mean) / stdDev
    const zScore = stdDev > 0 ? (currentPrice - longTermAvg) / stdDev : 0;

    return scoreMVRV(zScore);
  } catch (err) {
    log.debug(`MVRV fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return { zScore: 0, signal: 'fair', score: 0 };
  }
}

// ---------------------------------------------------------------------------
// Stock-to-Flow — INFORMATIONAL ONLY, 0% weight in scoring
// S2F is invalidated (deviation -75% to -82% from model)
// ---------------------------------------------------------------------------

export function computeS2F(
  totalMined: number,
  inflationRate: number,
  currentPrice: number,
): S2FResult {
  if (inflationRate <= 0 || totalMined <= 0) {
    return { ratio: 0, modelPrice: 0, deviationPct: 0, note: 'Insufficient data' };
  }

  const annualProduction = totalMined * (inflationRate / 100);
  const s2fRatio = annualProduction > 0 ? totalMined / annualProduction : 0;

  // PlanB model: price = e^(3.21 * ln(S2F) - 1.02)  (approximate)
  const modelPrice = s2fRatio > 0 ? Math.exp(3.21 * Math.log(s2fRatio) - 1.02) : 0;

  const deviationPct = modelPrice > 0 ? ((currentPrice - modelPrice) / modelPrice) * 100 : 0;

  return {
    ratio: s2fRatio,
    modelPrice,
    deviationPct,
    note: 'S2F is invalidated (deviation -75% to -82%). Informational only, 0% scoring weight.',
  };
}

// ---------------------------------------------------------------------------
// Supply Dynamics
// ---------------------------------------------------------------------------

export async function fetchSupplyDynamics(): Promise<SupplyDynamicsResult> {
  try {
    const [totalBtcData, txFeeData, minerRevenueData] = await Promise.allSettled([
      fetchChartData('total-bitcoins', '5days'),
      fetchChartData('transaction-fees-usd', '30days'),
      fetchChartData('miners-revenue', '30days'),
    ]);

    let percentMined = 93; // default estimate
    let feeRevenueShare = 0;

    if (totalBtcData.status === 'fulfilled' && totalBtcData.value.length > 0) {
      const latest = totalBtcData.value[totalBtcData.value.length - 1];
      // blockchain.info returns in BTC already for this chart
      percentMined = (latest.y / 21_000_000) * 100;
      if (percentMined > 100 || percentMined < 50) {
        // Might be in satoshis
        percentMined = (latest.y / 1e8 / 21_000_000) * 100;
      }
    }

    if (txFeeData.status === 'fulfilled' && minerRevenueData.status === 'fulfilled') {
      const fees = txFeeData.value;
      const revenue = minerRevenueData.value;
      if (fees.length > 0 && revenue.length > 0) {
        const avgFees = fees.reduce((s, f) => s + f.y, 0) / fees.length;
        const avgRevenue = revenue.reduce((s, r) => s + r.y, 0) / revenue.length;
        feeRevenueShare = avgRevenue > 0 ? (avgFees / avgRevenue) * 100 : 0;
      }
    }

    // Inflation rate: ~1.7% as of 2024 epoch
    const inflationRate = percentMined > 0 ? ((100 - percentMined) / percentMined) * (100 / 4) : 0;

    // Score: lower inflation + higher fee share = healthier
    let score = 0;
    if (inflationRate < 2) score += 10;
    if (feeRevenueShare > 5) score += 15;
    if (feeRevenueShare > 15) score += 10;
    if (percentMined > 90) score += 5;

    return { percentMined, inflationRate: Math.min(inflationRate, 10), feeRevenueShare, score };
  } catch (err) {
    log.debug(`Supply dynamics failed: ${err instanceof Error ? err.message : String(err)}`);
    return { percentMined: 93, inflationRate: 1.7, feeRevenueShare: 3, score: 10 };
  }
}

// ---------------------------------------------------------------------------
// Combined on-chain valuation
// ---------------------------------------------------------------------------

export async function fetchOnChainValuation(): Promise<OnChainValuationResult> {
  const [nvtResult, mvrvResult, supplyResult] = await Promise.allSettled([
    fetchNVTRatio(),
    fetchMVRVZScore(),
    fetchSupplyDynamics(),
  ]);

  const nvt: NVTResult =
    nvtResult.status === 'fulfilled' ? nvtResult.value : { ratio: 0, signal: 'fair', score: 0 };
  const mvrv: MVRVResult =
    mvrvResult.status === 'fulfilled' ? mvrvResult.value : { zScore: 0, signal: 'fair', score: 0 };
  const supplyDynamics: SupplyDynamicsResult =
    supplyResult.status === 'fulfilled'
      ? supplyResult.value
      : { percentMined: 93, inflationRate: 1.7, feeRevenueShare: 3, score: 10 };

  // S2F is informational only
  const s2f: S2FResult = {
    ratio: 0,
    modelPrice: 0,
    deviationPct: 0,
    note: 'S2F informational only, 0% weight',
  };

  // Composite: MVRV 55%, NVT 45% (S2F excluded)
  const compositeScore = Math.round(mvrv.score * 0.55 + nvt.score * 0.45);
  const direction: 'bullish' | 'bearish' | 'neutral' =
    compositeScore > 15 ? 'bullish' : compositeScore < -15 ? 'bearish' : 'neutral';

  // Confidence based on data availability
  let confidence = 30; // base
  if (nvtResult.status === 'fulfilled' && nvt.ratio > 0) confidence += 30;
  if (mvrvResult.status === 'fulfilled' && mvrv.zScore !== 0) confidence += 30;
  if (supplyResult.status === 'fulfilled') confidence += 10;

  return {
    nvt,
    mvrv,
    s2f,
    supplyDynamics,
    composite: { score: compositeScore, direction },
    confidence: Math.min(100, confidence),
  };
}
