// ---------------------------------------------------------------------------
// DeFiLlama API client — free, no auth required
// https://api-docs.defillama.com/
// ---------------------------------------------------------------------------

const BASE = 'https://api.llama.fi';
const COINS_BASE = 'https://coins.llama.fi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FundraisingRound {
  date: number; // unix timestamp
  name: string;
  round: string; // e.g. "Seed", "Series A", "Token Launch"
  amount: number | null; // USD raised
  chains: string[];
  sector: string;
  category: string;
  leadInvestors: string[];
  otherInvestors: string[];
  valuation: number | null;
  source: string | null;
  defiLlamaId: string | null;
}

export interface Protocol {
  id: string;
  name: string;
  symbol: string;
  url: string;
  chains: string[];
  tvl: number;
  change_1h: number | null;
  change_1d: number | null;
  change_7d: number | null;
  mcap: number | null;
  category: string;
  logo: string | null;
}

export interface ProtocolDetail extends Protocol {
  description: string;
  tvlList: { date: number; totalLiquidityUSD: number }[];
  currentChainTvls: Record<string, number>;
}

export interface ChainTvl {
  gecko_id: string | null;
  tvl: number;
  tokenSymbol: string;
  cmcId: string | null;
  name: string;
  chainId: number | null;
}

export interface DexOverview {
  totalDataChart: [number, number][];
  totalDataChartBreakdown: Record<string, unknown>[];
  protocols: {
    name: string;
    displayName: string;
    module: string;
    category: string;
    chains: string[];
    total24h: number | null;
    total7d: number | null;
    total30d: number | null;
    change_1d: number | null;
  }[];
  total24h: number;
  total7d: number;
  total30d: number;
  change_1d: number;
}

export interface PriceData {
  price: number;
  symbol: string;
  timestamp: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DeFiLlama API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch all crypto fundraising rounds. Returns the full list — filter client-side.
 */
export async function fetchRaises(): Promise<FundraisingRound[]> {
  const data = await fetchJson<{ raises: FundraisingRound[] }>(`${BASE}/raises`);
  return data.raises ?? [];
}

/**
 * Fetch recent raises (last N days).
 */
export async function fetchRecentRaises(days = 30): Promise<FundraisingRound[]> {
  const raises = await fetchRaises();
  const cutoff = Date.now() / 1000 - days * 86400;
  return raises.filter((r) => r.date >= cutoff).sort((a, b) => b.date - a.date);
}

/**
 * Fetch all DeFi protocols with TVL.
 */
export async function fetchProtocols(): Promise<Protocol[]> {
  return fetchJson<Protocol[]>(`${BASE}/protocols`);
}

/**
 * Fetch detailed info for a specific protocol.
 */
export async function fetchProtocol(slug: string): Promise<ProtocolDetail> {
  return fetchJson<ProtocolDetail>(`${BASE}/protocol/${encodeURIComponent(slug)}`);
}

/**
 * Fetch current prices for tokens. Coins must be in "chain:address" format.
 * Example: ["ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7"]
 */
export async function fetchTokenPrices(coins: string[]): Promise<Record<string, PriceData>> {
  const data = await fetchJson<{ coins: Record<string, PriceData> }>(
    `${COINS_BASE}/prices/current/${coins.map(encodeURIComponent).join(',')}`,
  );
  return data.coins ?? {};
}

/**
 * Fetch TVL data for all chains.
 */
export async function fetchChainTvl(): Promise<ChainTvl[]> {
  return fetchJson<ChainTvl[]>(`${BASE}/v2/chains`);
}

/**
 * Fetch DEX volume overview, optionally for a specific chain.
 */
export async function fetchDexOverview(chain?: string): Promise<DexOverview> {
  const path = chain ? `/overview/dexs/${encodeURIComponent(chain)}` : '/overview/dexs';
  return fetchJson<DexOverview>(`${BASE}${path}`);
}
