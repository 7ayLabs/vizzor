// ---------------------------------------------------------------------------
// DexPairTracker — new DEX pair detection and liquidity tracking (chain-agnostic)
// Uses DexScreener API + SQLite cache for recently detected pairs
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';
import { getDb } from '../cache.js';

const log = createLogger('dex-pair-tracker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewPair {
  token: string;
  baseToken: string; // e.g., WETH, WSOL
  dex: string;
  chain: string;
  pairAddress: string;
  liquidity: number; // USD
  initialPrice: number;
  createdAt: number;
}

export interface PairUpdate {
  pairAddress: string;
  price: number;
  priceChange: number; // % from initial
  volume: number;
  liquidity: number;
  buyCount: number;
  sellCount: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// DexScreener API response types
// ---------------------------------------------------------------------------

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd: string | null;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: { m5: number; h1: number; h6: number; h24: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number } | null;
  pairCreatedAt: number | null;
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEXSCREENER_BASE = 'https://api.dexscreener.com';

// Chain ID mapping for DexScreener API
const CHAIN_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  solana: 'solana',
  bsc: 'bsc',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  base: 'base',
  avalanche: 'avalanche',
  optimism: 'optimism',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchDexScreener<T>(path: string): Promise<T> {
  const res = await fetch(`${DEXSCREENER_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`DexScreener API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

function resolveChain(chain: string): string {
  return CHAIN_MAP[chain.toLowerCase()] ?? chain.toLowerCase();
}

// ---------------------------------------------------------------------------
// DB initialization
// ---------------------------------------------------------------------------

let tableInitialized = false;

function ensureTable(): void {
  if (tableInitialized) return;

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS dex_new_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      base_token TEXT NOT NULL,
      dex TEXT NOT NULL,
      chain TEXT NOT NULL,
      pair_address TEXT UNIQUE NOT NULL,
      liquidity REAL NOT NULL DEFAULT 0,
      initial_price REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Index for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dex_new_pairs_chain ON dex_new_pairs (chain);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_dex_new_pairs_created ON dex_new_pairs (created_at);
  `);

  tableInitialized = true;
}

// ---------------------------------------------------------------------------
// DexPairTracker
// ---------------------------------------------------------------------------

export class DexPairTracker {
  constructor() {
    ensureTable();
  }

  /**
   * Detect new pairs on a specific chain within the given time window.
   * Uses DexScreener search API and filters by creation time.
   */
  async detectNewPairs(chain: string, sinceMins = 30): Promise<NewPair[]> {
    const resolvedChain = resolveChain(chain);
    const cutoff = Date.now() - sinceMins * 60 * 1000;

    try {
      // DexScreener token-profiles endpoint shows recently listed tokens
      const data = await fetchDexScreener<DexScreenerResponse>(
        `/token-pairs/v1/${encodeURIComponent(resolvedChain)}/recent`,
      ).catch(() => {
        // Fallback: use search with chain filter
        return fetchDexScreener<DexScreenerResponse>(
          `/latest/dex/pairs/${encodeURIComponent(resolvedChain)}`,
        );
      });

      const pairs = data.pairs ?? [];

      const newPairs: NewPair[] = pairs
        .filter((pair) => {
          const createdAt = pair.pairCreatedAt ?? 0;
          return createdAt >= cutoff;
        })
        .map((pair) => this.dexPairToNewPair(pair, resolvedChain))
        .sort((a, b) => b.liquidity - a.liquidity);

      // Cache to SQLite
      for (const pair of newPairs) {
        this.cachePair(pair);
      }

      log.info(`Detected ${newPairs.length} new pairs on ${resolvedChain} in last ${sinceMins}min`);

      return newPairs;
    } catch (err) {
      log.error(
        `Failed to detect new pairs on ${resolvedChain}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /**
   * Fetch current data for a specific pair.
   */
  async trackPair(pairAddress: string): Promise<PairUpdate> {
    try {
      // Try multiple chains — DexScreener pair endpoint requires chainId
      // We try to look up the chain from our cache first
      const cachedPair = this.getCachedPairByAddress(pairAddress);
      const chain = cachedPair?.chain ?? 'ethereum';

      const data = await fetchDexScreener<DexScreenerResponse>(
        `/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pairAddress)}`,
      );

      const pair = data.pairs?.[0];
      if (!pair) {
        throw new Error(`Pair not found: ${pairAddress}`);
      }

      const initialPrice = cachedPair?.initialPrice ?? parseFloat(pair.priceUsd ?? '0');
      const currentPrice = parseFloat(pair.priceUsd ?? '0');
      const priceChange =
        initialPrice > 0 ? ((currentPrice - initialPrice) / initialPrice) * 100 : 0;

      return {
        pairAddress,
        price: currentPrice,
        priceChange,
        volume: pair.volume.h24,
        liquidity: pair.liquidity?.usd ?? 0,
        buyCount: pair.txns.h24.buys,
        sellCount: pair.txns.h24.sells,
        timestamp: Date.now(),
      };
    } catch (err) {
      log.error(
        `Failed to track pair ${pairAddress}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        pairAddress,
        price: 0,
        priceChange: 0,
        volume: 0,
        liquidity: 0,
        buyCount: 0,
        sellCount: 0,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get recently detected pairs from the SQLite cache.
   */
  async getRecentPairs(chain?: string, limit = 50): Promise<NewPair[]> {
    const db = getDb();

    let query = 'SELECT * FROM dex_new_pairs';
    const params: unknown[] = [];

    if (chain) {
      query += ' WHERE chain = ?';
      params.push(resolveChain(chain));
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as {
      token: string;
      base_token: string;
      dex: string;
      chain: string;
      pair_address: string;
      liquidity: number;
      initial_price: number;
      created_at: number;
    }[];

    return rows.map((row) => ({
      token: row.token,
      baseToken: row.base_token,
      dex: row.dex,
      chain: row.chain,
      pairAddress: row.pair_address,
      liquidity: row.liquidity,
      initialPrice: row.initial_price,
      createdAt: row.created_at,
    }));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private dexPairToNewPair(pair: DexScreenerPair, chain: string): NewPair {
    return {
      token: pair.baseToken.address,
      baseToken: pair.quoteToken.symbol,
      dex: pair.dexId,
      chain,
      pairAddress: pair.pairAddress,
      liquidity: pair.liquidity?.usd ?? 0,
      initialPrice: parseFloat(pair.priceUsd ?? '0'),
      createdAt: pair.pairCreatedAt ?? Date.now(),
    };
  }

  private cachePair(pair: NewPair): void {
    try {
      const db = getDb();
      db.prepare(
        `INSERT OR IGNORE INTO dex_new_pairs
         (token, base_token, dex, chain, pair_address, liquidity, initial_price, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        pair.token,
        pair.baseToken,
        pair.dex,
        pair.chain,
        pair.pairAddress,
        pair.liquidity,
        pair.initialPrice,
        pair.createdAt,
      );
    } catch (err) {
      log.debug(
        `Failed to cache pair ${pair.pairAddress}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private getCachedPairByAddress(pairAddress: string): NewPair | null {
    try {
      const db = getDb();
      const row = db
        .prepare('SELECT * FROM dex_new_pairs WHERE pair_address = ?')
        .get(pairAddress) as
        | {
            token: string;
            base_token: string;
            dex: string;
            chain: string;
            pair_address: string;
            liquidity: number;
            initial_price: number;
            created_at: number;
          }
        | undefined;

      if (!row) return null;

      return {
        token: row.token,
        baseToken: row.base_token,
        dex: row.dex,
        chain: row.chain,
        pairAddress: row.pair_address,
        liquidity: row.liquidity,
        initialPrice: row.initial_price,
        createdAt: row.created_at,
      };
    } catch {
      return null;
    }
  }
}
