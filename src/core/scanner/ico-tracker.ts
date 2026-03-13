// ---------------------------------------------------------------------------
// ICO / Fundraising tracker — powered by DeFiLlama raises + Pump.fun
// ---------------------------------------------------------------------------

import {
  fetchRecentRaises,
  fetchRaisesByRound,
  fetchRaisesByInvestor,
} from '../../data/sources/defillama.js';
import { fetchLatestCoins } from '../../data/sources/pumpfun.js';
import type { FundraisingRound } from '../../data/sources/defillama.js';

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
  roundType: string;
  investors: string[];
  valuation: number | null;
  previousRounds: { round: string; amount: number | null; date: string }[];
}

function raiseToICO(r: FundraisingRound): ICOProject {
  return {
    id: r.defiLlamaId ?? r.name.toLowerCase().replace(/\s+/g, '-'),
    name: r.name,
    symbol: '',
    category: r.category || r.sector || 'crypto',
    chain: r.chains[0] ?? 'multi-chain',
    status: 'active',
    startDate: new Date(r.date * 1000).toISOString(),
    endDate: null,
    description: `${r.round} round${r.amount ? ` — $${(r.amount / 1e6).toFixed(1)}M raised` : ''}. ${r.leadInvestors.length > 0 ? `Led by ${r.leadInvestors.join(', ')}.` : ''}`,
    website: r.source,
    raisedAmount: r.amount,
    targetAmount: null,
    roundType: r.round,
    investors: [...r.leadInvestors, ...r.otherInvestors],
    valuation: r.valuation,
    previousRounds: [],
  };
}

/**
 * Fetch recent fundraising rounds from DeFiLlama.
 */
export async function fetchUpcomingICOs(): Promise<ICOProject[]> {
  try {
    const raises = await fetchRecentRaises(30);
    return raises.slice(0, 20).map(raiseToICO);
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
      roundType: 'Fair Launch',
      investors: [],
      valuation: c.usd_market_cap ?? null,
      previousRounds: [],
    }));
  } catch {
    return [];
  }
}

/**
 * Search raises and launches by query, category, chain, or round type.
 */
export async function searchICOs(
  query?: string,
  category?: string,
  chain?: string,
  roundType?: string,
): Promise<ICOProject[]> {
  try {
    let raises: FundraisingRound[];
    if (roundType) {
      raises = await fetchRaisesByRound(roundType, 90);
    } else {
      raises = await fetchRecentRaises(90);
    }

    let filtered = raises.map(raiseToICO);

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

/**
 * Get funding history for a project by name — finds all rounds involving that name.
 */
export async function getProjectFundingHistory(
  name: string,
): Promise<{ name: string; rounds: ICOProject[] }> {
  try {
    const raises = await fetchRecentRaises(365);
    const lower = name.toLowerCase();
    const matches = raises
      .filter((r) => r.name.toLowerCase().includes(lower))
      .sort((a, b) => a.date - b.date)
      .map(raiseToICO);

    // Link previous rounds
    for (let i = 1; i < matches.length; i++) {
      const project = matches[i];
      if (project) {
        project.previousRounds = matches.slice(0, i).map((prev) => ({
          round: prev.roundType,
          amount: prev.raisedAmount,
          date: prev.startDate ?? '',
        }));
      }
    }

    return { name, rounds: matches };
  } catch {
    return { name, rounds: [] };
  }
}

/**
 * Get raises by a specific investor.
 */
export async function getInvestorPortfolio(investor: string): Promise<ICOProject[]> {
  try {
    const raises = await fetchRaisesByInvestor(investor, 365);
    return raises.slice(0, 30).map(raiseToICO);
  } catch {
    return [];
  }
}
