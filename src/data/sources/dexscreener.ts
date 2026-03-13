// ---------------------------------------------------------------------------
// DexScreener API client — real-time DEX pair data, no auth required
// https://docs.dexscreener.com/api/reference
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.dexscreener.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DexToken {
  address: string;
  name: string;
  symbol: string;
}

export interface DexTxns {
  buys: number;
  sells: number;
}

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  baseToken: DexToken;
  quoteToken: DexToken;
  priceNative: string;
  priceUsd: string | null;
  txns: {
    m5: DexTxns;
    h1: DexTxns;
    h6: DexTxns;
    h24: DexTxns;
  };
  volume: { m5: number; h1: number; h6: number; h24: number };
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  liquidity: { usd: number; base: number; quote: number } | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  info?: {
    imageUrl?: string;
    websites?: { url: string; label?: string }[];
    socials?: { type: string; url: string }[];
  };
  labels?: string[];
}

export interface TokenProfile {
  url: string;
  chainId: string;
  tokenAddress: string;
  icon?: string;
  description?: string;
  links?: { type?: string; label?: string; url: string }[];
}

export interface TokenBoost {
  url: string;
  chainId: string;
  tokenAddress: string;
  amount: number;
  totalAmount: number;
  icon?: string;
  description?: string;
  links?: { type?: string; label?: string; url: string }[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`DexScreener API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Search for token pairs by name, symbol, or address.
 */
export async function searchTokens(query: string): Promise<DexPair[]> {
  const data = await fetchJson<{ pairs: DexPair[] | null }>(
    `/latest/dex/search?q=${encodeURIComponent(query)}`,
  );
  return data.pairs ?? [];
}

/**
 * Get all trading pairs for a specific token on a chain.
 */
export async function getTokenPairs(chainId: string, tokenAddress: string): Promise<DexPair[]> {
  const data = await fetchJson<{ pairs: DexPair[] | null }>(
    `/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`,
  );
  return data.pairs ?? [];
}

/**
 * Get the latest boosted tokens (promoted on DexScreener).
 */
export async function getLatestBoostedTokens(): Promise<TokenBoost[]> {
  return fetchJson<TokenBoost[]>('/token-boosts/latest/v1');
}

/**
 * Get the top boosted tokens by total boost amount.
 */
export async function getTopBoostedTokens(): Promise<TokenBoost[]> {
  return fetchJson<TokenBoost[]>('/token-boosts/top/v1');
}

/**
 * Get the latest token profiles (recently updated tokens with metadata).
 */
export async function getLatestTokenProfiles(): Promise<TokenProfile[]> {
  return fetchJson<TokenProfile[]>('/token-profiles/latest/v1');
}

/**
 * Get a specific pair by chain and pair address.
 */
export async function getPair(chainId: string, pairAddress: string): Promise<DexPair | null> {
  const data = await fetchJson<{ pairs: DexPair[] | null }>(
    `/latest/dex/pairs/${encodeURIComponent(chainId)}/${encodeURIComponent(pairAddress)}`,
  );
  return data.pairs?.[0] ?? null;
}
