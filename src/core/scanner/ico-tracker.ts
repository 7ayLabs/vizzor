// ---------------------------------------------------------------------------
// ICO / Fundraising tracker — powered by DeFiLlama raises + Pump.fun
// ---------------------------------------------------------------------------

import { fetchRecentRaises } from '../../data/sources/defillama.js';
import { fetchLatestCoins } from '../../data/sources/pumpfun.js';

export interface ICOProject {
  id: string;
  name: string;
  symbol: string;
  category: string;
  chain: string;
  status: 'upcoming' | 'active' | 'ended';
  startDate: string | null;
  endDate: string | null;
  description: string;
  website: string | null;
  raisedAmount: number | null;
  targetAmount: number | null;
}

/**
 * Fetch recent fundraising rounds from DeFiLlama.
 * These represent real crypto raises, token launches, and funding rounds.
 */
export async function fetchUpcomingICOs(): Promise<ICOProject[]> {
  try {
    const raises = await fetchRecentRaises(30);

    return raises.slice(0, 20).map((r) => ({
      id: r.defiLlamaId ?? r.name.toLowerCase().replace(/\s+/g, '-'),
      name: r.name,
      symbol: '',
      category: r.category || r.sector || 'crypto',
      chain: r.chains[0] ?? 'multi-chain',
      status: 'active' as const,
      startDate: new Date(r.date * 1000).toISOString(),
      endDate: null,
      description: `${r.round} round. ${r.leadInvestors.length > 0 ? `Led by ${r.leadInvestors.join(', ')}.` : ''}`,
      website: r.source,
      raisedAmount: r.amount,
      targetAmount: null,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch latest Pump.fun launches (Solana meme coins).
 */
export async function fetchActiveICOs(): Promise<ICOProject[]> {
  try {
    const coins = await fetchLatestCoins(20);

    return coins.map((c) => ({
      id: c.mint,
      name: c.name,
      symbol: c.symbol,
      category: 'meme',
      chain: 'solana',
      status: 'active' as const,
      startDate: new Date(c.created_timestamp).toISOString(),
      endDate: null,
      description:
        c.description || `Pump.fun launch. Market cap: $${c.usd_market_cap?.toFixed(0) ?? '?'}`,
      website: null,
      raisedAmount: c.usd_market_cap ?? null,
      targetAmount: null,
    }));
  } catch {
    return [];
  }
}

/**
 * Search raises and launches by query, category, or chain.
 */
export async function searchICOs(
  query?: string,
  category?: string,
  chain?: string,
): Promise<ICOProject[]> {
  try {
    const raises = await fetchRecentRaises(90);

    let filtered = raises.map((r) => ({
      id: r.defiLlamaId ?? r.name.toLowerCase().replace(/\s+/g, '-'),
      name: r.name,
      symbol: '',
      category: r.category || r.sector || 'crypto',
      chain: r.chains[0] ?? 'multi-chain',
      status: 'active' as const,
      startDate: new Date(r.date * 1000).toISOString(),
      endDate: null,
      description: `${r.round} round${r.amount ? ` — $${(r.amount / 1e6).toFixed(1)}M raised` : ''}. ${r.leadInvestors.length > 0 ? `Led by ${r.leadInvestors.join(', ')}.` : ''}`,
      website: r.source,
      raisedAmount: r.amount,
      targetAmount: null,
    }));

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
      );
    }
    if (category) {
      const cat = category.toLowerCase();
      filtered = filtered.filter((p) => p.category.toLowerCase().includes(cat));
    }
    if (chain) {
      const ch = chain.toLowerCase();
      filtered = filtered.filter((p) => p.chain.toLowerCase().includes(ch));
    }

    return filtered.slice(0, 20);
  } catch {
    return [];
  }
}
