// ---------------------------------------------------------------------------
// Universal Crypto Prediction Market Adapter
// Connects to any CLOB/AMM prediction market with configurable endpoints.
// Default configuration targets the Gamma API (public, no auth required).
// ---------------------------------------------------------------------------

import type { PredictionMarketSignal } from './types.js';
import { GenericPredictionMarketAdapter, type PredictionMarketConfig } from './adapter.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('prediction-markets:crypto');

// ---------------------------------------------------------------------------
// Types for Gamma API response format
// ---------------------------------------------------------------------------

interface GammaMarket {
  id?: string;
  condition_id?: string;
  question?: string;
  description?: string;
  outcome_prices?: string; // JSON string: "[0.65, 0.35]"
  outcomes?: string; // JSON string: '["Yes", "No"]'
  volume?: number;
  volume_num?: number;
  liquidity?: number;
  liquidity_num?: number;
  active?: boolean;
  closed?: boolean;
  tags?: { label?: string; slug?: string }[];
  end_date_iso?: string;
}

// ---------------------------------------------------------------------------
// Token keyword matching (for relating markets to crypto symbols)
// ---------------------------------------------------------------------------

const CRYPTO_KEYWORDS: Record<string, string[]> = {
  BTC: ['bitcoin', 'btc', 'Bitcoin'],
  ETH: ['ethereum', 'eth', 'Ethereum', 'ether'],
  SOL: ['solana', 'sol', 'Solana'],
  DOGE: ['dogecoin', 'doge', 'Dogecoin'],
  XRP: ['ripple', 'xrp', 'Ripple'],
  ADA: ['cardano', 'ada', 'Cardano'],
  DOT: ['polkadot', 'dot', 'Polkadot'],
  AVAX: ['avalanche', 'avax', 'Avalanche'],
  MATIC: ['polygon', 'matic', 'Polygon'],
  LINK: ['chainlink', 'link', 'Chainlink'],
  UNI: ['uniswap', 'uni', 'Uniswap'],
  AAVE: ['aave', 'Aave'],
  ARB: ['arbitrum', 'arb', 'Arbitrum'],
  OP: ['optimism', 'op', 'Optimism'],
};

/**
 * Extract related token symbols from a market question/description.
 */
function extractRelatedTokens(question: string): string[] {
  const tokens: string[] = [];
  const lowerQuestion = question.toLowerCase();

  for (const [symbol, keywords] of Object.entries(CRYPTO_KEYWORDS)) {
    if (keywords.some((kw) => lowerQuestion.includes(kw.toLowerCase()))) {
      tokens.push(symbol);
    }
  }

  return tokens;
}

/**
 * Map a Gamma API market response to our universal signal format.
 */
function mapGammaMarket(raw: unknown): PredictionMarketSignal {
  const market = raw as GammaMarket;

  const id = market.condition_id ?? market.id ?? '';
  const question = market.question ?? '';

  // Parse outcome prices: "[0.65, 0.35]" → P(yes) = 0.65
  let probability = 0.5;
  if (market.outcome_prices) {
    try {
      const prices: unknown = JSON.parse(market.outcome_prices);
      if (Array.isArray(prices) && prices.length > 0) {
        const firstPrice = Number(prices[0]);
        if (isFinite(firstPrice)) {
          probability = firstPrice;
        }
      }
    } catch {
      // Invalid JSON — use default
    }
  }

  // Determine category from tags
  let category = 'crypto_price';
  if (market.tags) {
    for (const tag of market.tags) {
      const slug = tag.slug ?? tag.label ?? '';
      if (slug.includes('defi')) category = 'defi';
      else if (slug.includes('regulation')) category = 'regulation';
      else if (slug.includes('tech')) category = 'technology';
    }
  }

  return {
    platform: 'gamma_markets',
    marketId: String(id),
    question,
    category,
    probability: Math.max(0, Math.min(1, probability)),
    volume: market.volume_num ?? market.volume ?? 0,
    liquidity: market.liquidity_num ?? market.liquidity ?? 0,
    momentumScore: 0, // will be enriched by GenericPredictionMarketAdapter
    relatedTokens: extractRelatedTokens(question),
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Default Gamma API configuration (public, no auth)
// ---------------------------------------------------------------------------

const DEFAULT_GAMMA_CONFIG: PredictionMarketConfig = {
  platform: 'gamma_markets',
  baseUrl: 'https://gamma-api.polymarket.com',
  endpoints: {
    activeMarkets: '/markets?tag=crypto&closed=false&limit=50',
    market: '/markets/:id',
    search: '/markets',
  },
  mapMarket: mapGammaMarket,
};

/**
 * Create a crypto prediction market adapter with the given configuration.
 * Defaults to the Gamma API if no config is provided.
 */
export function createCryptoPredictionMarketAdapter(
  config?: Partial<PredictionMarketConfig>,
): GenericPredictionMarketAdapter {
  const mergedConfig: PredictionMarketConfig = {
    ...DEFAULT_GAMMA_CONFIG,
    ...config,
    endpoints: {
      ...DEFAULT_GAMMA_CONFIG.endpoints,
      ...config?.endpoints,
    },
    mapMarket: config?.mapMarket ?? DEFAULT_GAMMA_CONFIG.mapMarket,
  };

  log.info(`Created crypto prediction market adapter: ${mergedConfig.platform}`);
  return new GenericPredictionMarketAdapter(mergedConfig);
}
