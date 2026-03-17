// ---------------------------------------------------------------------------
// Bitcoin Network APIs — blockchain.info + mempool.space
// Free, no API key required.
// Rate limits: blockchain.info 10 req/min, mempool.space 15 req/min
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { TokenBucketRateLimiter } from '../rate-limiter.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('blockchain-info');

const BLOCKCHAIN_INFO_URL = 'https://blockchain.info';
const MEMPOOL_SPACE_URL = 'https://mempool.space/api';

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const blockchainInfoLimiter = new TokenBucketRateLimiter(10, 10 / 60);
const mempoolSpaceLimiter = new TokenBucketRateLimiter(15, 15 / 60);

// ---------------------------------------------------------------------------
// TTL cache with staleness support
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const TTL = {
  hashrate: 5 * 60 * 1000,
  difficulty: 30 * 60 * 1000,
  fees: 60 * 1000,
  blockCount: 2 * 60 * 1000,
  supply: 10 * 60 * 1000,
} as const;

const STALE_MULTIPLIER = 5;

function getCached<T>(key: string): { data: T; fresh: boolean } | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  if (age < entry.ttlMs) return { data: entry.data, fresh: true };
  if (age < entry.ttlMs * STALE_MULTIPLIER) return { data: entry.data, fresh: false };
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttlMs });
}

// ---------------------------------------------------------------------------
// Zod schemas with strict bounds
// ---------------------------------------------------------------------------

const HashrateSchema = z.number().positive().max(1e18);
const DifficultySchema = z.number().positive().max(1e30);
const BlockCountSchema = z.number().int().min(800_000);
const TotalBtcSatoshiSchema = z
  .number()
  .min(0)
  .max(21_000_001 * 1e8); // satoshis from /q/totalbc
const FeeRateSchema = z.number().min(0).max(10_000);

const MempoolInfoSchema = z.object({
  count: z.number().int().min(0),
  vsize: z.number().min(0),
  total_fee: z.number().min(0),
});

const DifficultyAdjustmentSchema = z.object({
  progressPercent: z.number().min(0).max(100),
  difficultyChange: z.number(),
  estimatedRetargetDate: z.number(),
  remainingBlocks: z.number().int().min(0),
  remainingTime: z.number().min(0),
});

const HashrateMiningSchema = z.object({
  currentHashrate: z.number().min(0),
  currentDifficulty: z.number().min(0),
});

// ---------------------------------------------------------------------------
// Anomaly detection — tracks last-known-good values
// ---------------------------------------------------------------------------

let lastKnownHashrate: number | null = null;
let lastKnownDifficulty: number | null = null;

function detectHashrateAnomaly(value: number): { clamped: number; anomaly: boolean } {
  if (lastKnownHashrate !== null) {
    const changePct = Math.abs(value - lastKnownHashrate) / lastKnownHashrate;
    if (changePct > 0.3) {
      log.debug(`Hashrate anomaly: ${changePct.toFixed(2)} change, clamping`);
      return { clamped: lastKnownHashrate, anomaly: true };
    }
  }
  lastKnownHashrate = value;
  return { clamped: value, anomaly: false };
}

function detectDifficultyAnomaly(value: number): { clamped: number; anomaly: boolean } {
  if (lastKnownDifficulty !== null) {
    const changePct = Math.abs(value - lastKnownDifficulty) / lastKnownDifficulty;
    if (changePct > 0.01) {
      log.debug(`Difficulty anomaly: ${changePct.toFixed(4)} change, clamping`);
      return { clamped: lastKnownDifficulty, anomaly: true };
    }
  }
  lastKnownDifficulty = value;
  return { clamped: value, anomaly: false };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BitcoinNetworkStats {
  hashrate: number;
  difficulty: number;
  blockHeight: number;
  mempoolTxCount: number;
  avgBlockTime: number;
  confidence: number;
}

export interface BitcoinSupplyStats {
  totalMined: number;
  blockReward: number;
  blocksUntilHalving: number;
  halvingEpoch: number;
  inflationRate: number;
  percentMined: number;
}

export interface BitcoinMiningStats {
  hashrate: number;
  difficulty: number;
  difficultyAdjustmentPct: number;
  avgFeeRate: number;
  blocksUntilAdjustment: number;
}

export interface NetworkHealthResult {
  network: BitcoinNetworkStats;
  supply: BitcoinSupplyStats;
  mining: BitcoinMiningStats;
  healthScore: number;
  confidence: number;
  sources: string[];
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchBlockchainInfoScalar<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  await blockchainInfoLimiter.acquire();
  const res = await fetch(`${BLOCKCHAIN_INFO_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`blockchain.info API error: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const num = Number(text.trim());
  return schema.parse(num);
}

async function fetchMempool<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  await mempoolSpaceLimiter.acquire();
  const res = await fetch(`${MEMPOOL_SPACE_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`mempool.space API error: ${res.status} ${res.statusText}`);
  const raw = await res.json();
  return schema.parse(raw);
}

// ---------------------------------------------------------------------------
// Halving constants
// ---------------------------------------------------------------------------

const HALVING_INTERVAL = 210_000;
const INITIAL_REWARD = 50;

function getHalvingEpoch(blockHeight: number): number {
  return Math.floor(blockHeight / HALVING_INTERVAL);
}

function getBlockReward(blockHeight: number): number {
  const epoch = getHalvingEpoch(blockHeight);
  return INITIAL_REWARD / Math.pow(2, epoch);
}

function getBlocksUntilHalving(blockHeight: number): number {
  const nextHalving = (getHalvingEpoch(blockHeight) + 1) * HALVING_INTERVAL;
  return nextHalving - blockHeight;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchBitcoinNetworkStats(): Promise<BitcoinNetworkStats> {
  const cacheKey = 'btc-network-stats';
  const cached = getCached<BitcoinNetworkStats>(cacheKey);
  if (cached?.fresh) return cached.data;

  let confidence = 100;
  const errors: string[] = [];

  // Fetch from blockchain.info
  let hashrate = 0;
  let difficulty = 0;
  let blockHeight = 0;

  try {
    [hashrate, difficulty, blockHeight] = await Promise.all([
      fetchBlockchainInfoScalar('/q/hashrate', HashrateSchema),
      fetchBlockchainInfoScalar('/q/getdifficulty', DifficultySchema),
      fetchBlockchainInfoScalar('/q/getblockcount', BlockCountSchema),
    ]);
  } catch (err) {
    errors.push(`blockchain.info: ${err instanceof Error ? err.message : String(err)}`);
    confidence -= 30;
    // Try stale cache
    if (cached) return { ...cached.data, confidence: Math.max(0, confidence) };
  }

  // Anomaly checks
  const hr = detectHashrateAnomaly(hashrate);
  if (hr.anomaly) confidence -= 15;
  hashrate = hr.clamped;

  const df = detectDifficultyAnomaly(difficulty);
  if (df.anomaly) confidence -= 10;
  difficulty = df.clamped;

  // Fetch mempool
  let mempoolTxCount = 0;
  try {
    const mempool = await fetchMempool('/mempool', MempoolInfoSchema);
    mempoolTxCount = mempool.count;
  } catch (err) {
    errors.push(`mempool.space: ${err instanceof Error ? err.message : String(err)}`);
    confidence -= 10;
  }

  // Cross-reference hashrate with mempool.space
  try {
    const mempoolMining = await fetchMempool('/v1/mining/hashrate/1w', HashrateMiningSchema);
    if (hashrate > 0 && mempoolMining.currentHashrate > 0) {
      const divergence =
        Math.abs(hashrate * 1e9 - mempoolMining.currentHashrate) /
        Math.max(hashrate * 1e9, mempoolMining.currentHashrate);
      if (divergence > 0.2) {
        log.debug(`Hashrate cross-ref divergence: ${(divergence * 100).toFixed(1)}%`);
        confidence -= 15;
      }
    }
  } catch {
    // Cross-reference is best-effort
  }

  if (errors.length > 0) {
    log.debug(`Network stats errors: ${errors.join('; ')}`);
  }

  const result: BitcoinNetworkStats = {
    hashrate,
    difficulty,
    blockHeight,
    mempoolTxCount,
    avgBlockTime: 600, // ~10 minutes nominal
    confidence: Math.max(0, confidence),
  };

  setCache(cacheKey, result, TTL.hashrate);
  return result;
}

export async function fetchBitcoinSupplyStats(): Promise<BitcoinSupplyStats> {
  const cacheKey = 'btc-supply-stats';
  const cached = getCached<BitcoinSupplyStats>(cacheKey);
  if (cached?.fresh) return cached.data;

  let totalMined: number;
  let blockHeight: number;

  try {
    [totalMined, blockHeight] = await Promise.all([
      fetchBlockchainInfoScalar('/q/totalbc', TotalBtcSatoshiSchema).then((v) => v / 1e8), // satoshis to BTC
      fetchBlockchainInfoScalar('/q/getblockcount', BlockCountSchema),
    ]);
  } catch {
    if (cached) return cached.data;
    throw new Error('Failed to fetch Bitcoin supply stats');
  }

  const blockReward = getBlockReward(blockHeight);
  const blocksUntilHalving = getBlocksUntilHalving(blockHeight);
  const halvingEpoch = getHalvingEpoch(blockHeight);

  // Annual inflation = (blocks per year * reward) / total supply
  const blocksPerYear = 365.25 * 24 * 6; // ~52,596
  const annualNewSupply = blocksPerYear * blockReward;
  const inflationRate = totalMined > 0 ? (annualNewSupply / totalMined) * 100 : 0;

  const result: BitcoinSupplyStats = {
    totalMined,
    blockReward,
    blocksUntilHalving,
    halvingEpoch,
    inflationRate,
    percentMined: (totalMined / 21_000_000) * 100,
  };

  setCache(cacheKey, result, TTL.supply);
  return result;
}

export async function fetchBitcoinMiningStats(): Promise<BitcoinMiningStats> {
  const cacheKey = 'btc-mining-stats';
  const cached = getCached<BitcoinMiningStats>(cacheKey);
  if (cached?.fresh) return cached.data;

  let hashrate: number;
  let difficulty: number;

  try {
    [hashrate, difficulty] = await Promise.all([
      fetchBlockchainInfoScalar('/q/hashrate', HashrateSchema),
      fetchBlockchainInfoScalar('/q/getdifficulty', DifficultySchema),
    ]);
  } catch {
    if (cached) return cached.data;
    throw new Error('Failed to fetch Bitcoin mining stats');
  }

  // Anomaly checks
  hashrate = detectHashrateAnomaly(hashrate).clamped;
  difficulty = detectDifficultyAnomaly(difficulty).clamped;

  // Difficulty adjustment from mempool.space
  let difficultyAdjustmentPct = 0;
  let blocksUntilAdjustment = 0;
  let avgFeeRate = 0;

  try {
    const adj = await fetchMempool('/v1/difficulty-adjustment', DifficultyAdjustmentSchema);
    difficultyAdjustmentPct = adj.difficultyChange;
    blocksUntilAdjustment = adj.remainingBlocks;
  } catch {
    // Non-critical
  }

  try {
    const fees = await fetchMempool(
      '/v1/fees/recommended',
      z.object({
        fastestFee: FeeRateSchema,
        halfHourFee: FeeRateSchema,
        hourFee: FeeRateSchema,
      }),
    );
    avgFeeRate = fees.halfHourFee;
  } catch {
    // Non-critical
  }

  const result: BitcoinMiningStats = {
    hashrate,
    difficulty,
    difficultyAdjustmentPct,
    avgFeeRate,
    blocksUntilAdjustment,
  };

  setCache(cacheKey, result, TTL.hashrate);
  return result;
}

export async function fetchNetworkHealth(): Promise<NetworkHealthResult> {
  const [networkResult, supplyResult, miningResult] = await Promise.allSettled([
    fetchBitcoinNetworkStats(),
    fetchBitcoinSupplyStats(),
    fetchBitcoinMiningStats(),
  ]);

  const network: BitcoinNetworkStats =
    networkResult.status === 'fulfilled'
      ? networkResult.value
      : {
          hashrate: 0,
          difficulty: 0,
          blockHeight: 0,
          mempoolTxCount: 0,
          avgBlockTime: 600,
          confidence: 0,
        };

  const supply: BitcoinSupplyStats =
    supplyResult.status === 'fulfilled'
      ? supplyResult.value
      : {
          totalMined: 0,
          blockReward: 0,
          blocksUntilHalving: 0,
          halvingEpoch: 0,
          inflationRate: 0,
          percentMined: 0,
        };

  const mining: BitcoinMiningStats =
    miningResult.status === 'fulfilled'
      ? miningResult.value
      : {
          hashrate: 0,
          difficulty: 0,
          difficultyAdjustmentPct: 0,
          avgFeeRate: 0,
          blocksUntilAdjustment: 0,
        };

  const sources: string[] = [];
  if (networkResult.status === 'fulfilled') sources.push('blockchain.info', 'mempool.space');
  if (supplyResult.status === 'fulfilled') sources.push('blockchain.info/supply');

  // Health score 0-100
  let healthScore = 50; // baseline

  // Hashrate positive → healthy
  if (network.hashrate > 0) healthScore += 20;

  // Mempool not congested (< 100K txs)
  if (network.mempoolTxCount > 0 && network.mempoolTxCount < 100_000) healthScore += 10;
  else if (network.mempoolTxCount >= 100_000) healthScore -= 10;

  // Difficulty increasing → network growing
  if (mining.difficultyAdjustmentPct > 0) healthScore += 10;
  else if (mining.difficultyAdjustmentPct < -5) healthScore -= 10;

  // Fee market exists
  if (mining.avgFeeRate > 1) healthScore += 10;

  healthScore = Math.max(0, Math.min(100, healthScore));

  const confidence = Math.max(
    0,
    Math.min(100, network.confidence * 0.5 + (sources.length >= 2 ? 50 : 25)),
  );

  return { network, supply, mining, healthScore, confidence, sources };
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export { getHalvingEpoch, getBlockReward, getBlocksUntilHalving, HALVING_INTERVAL };
