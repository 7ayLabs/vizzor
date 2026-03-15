// ---------------------------------------------------------------------------
// Pump.fun API client — latest Solana meme coin launches
// https://frontend-api-v3.pump.fun
// ---------------------------------------------------------------------------

// Real-time WebSocket listener available at ./launchpad-ws.ts
// Use LaunchpadWSListener for real-time migration event tracking
export {
  LaunchpadWSListener,
  type MigrationEvent,
  type MigrationCallback,
} from './launchpad-ws.js';

const BASE_URL = 'https://frontend-api-v3.pump.fun';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PumpCoin {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image_uri: string | null;
  market_cap: number;
  sol_amount: number;
  created_timestamp: number;
  creator: string;
  reply_count: number;
  last_reply: number | null;
  nsfw: boolean;
  usd_market_cap: number;
}

export interface PumpTrade {
  signature: string;
  mint: string;
  sol_amount: number;
  token_amount: number;
  is_buy: boolean;
  user: string;
  timestamp: number;
  slot: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
    },
  });
  if (!res.ok) {
    throw new Error(`Pump.fun API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch the latest coins launched on Pump.fun.
 */
export async function fetchLatestCoins(limit = 20, offset = 0): Promise<PumpCoin[]> {
  return fetchJson<PumpCoin[]>(`/coins/latest?limit=${limit}&offset=${offset}&includeNsfw=false`);
}

/**
 * Get details for a specific coin by mint address.
 */
export async function getCoinDetails(mint: string): Promise<PumpCoin> {
  return fetchJson<PumpCoin>(`/coins/${encodeURIComponent(mint)}`);
}

/**
 * Get recent trades for a specific token.
 */
export async function getTokenTrades(mint: string, limit = 20, offset = 0): Promise<PumpTrade[]> {
  return fetchJson<PumpTrade[]>(
    `/trades/token/${encodeURIComponent(mint)}?limit=${limit}&offset=${offset}`,
  );
}
