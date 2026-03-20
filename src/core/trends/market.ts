import {
  searchTokens as dexSearch,
  getTopBoostedTokens,
  type DexPair,
} from '../../data/sources/dexscreener.js';
import { getMLClient } from '../../ml/client.js';

export interface MarketData {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  priceChange7d: number;
  volume24h: number;
  marketCap: number;
  rank: number | null;
}

export interface MarketTrend {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  signals: string[];
}

export interface TrendingToken {
  name: string;
  symbol: string;
  chain: string;
  priceUsd: string;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number | null;
  url: string;
  source: 'dexscreener' | 'coingecko';
}

/**
 * Fetch market data for established coins from CoinGecko.
 */
export async function fetchMarketData(symbol: string): Promise<MarketData | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(symbol.toLowerCase())}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h,7d`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>[];
    if (!data || data.length === 0) return null;

    const coin = data[0];
    if (!coin) return null;

    return {
      symbol: String(coin['symbol'] ?? '').toUpperCase(),
      name: String(coin['name'] ?? ''),
      price: Number(coin['current_price'] ?? 0),
      priceChange24h: Number(coin['price_change_percentage_24h'] ?? 0),
      priceChange7d: Number(coin['price_change_percentage_7d_in_currency'] ?? 0),
      volume24h: Number(coin['total_volume'] ?? 0),
      marketCap: Number(coin['market_cap'] ?? 0),
      rank: coin['market_cap_rank'] != null ? Number(coin['market_cap_rank']) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Search for any token on DEXes via DexScreener.
 * Works for all tokens — including meme coins and newly launched tokens.
 */
export async function fetchTokenFromDex(query: string): Promise<DexPair[]> {
  try {
    return await dexSearch(query);
  } catch {
    return [];
  }
}

/**
 * Get currently trending/hot tokens from DexScreener (boosted tokens)
 * and CoinGecko trending combined.
 */
export async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  const results: TrendingToken[] = [];

  // DexScreener: top boosted tokens
  try {
    const boosted = await getTopBoostedTokens();
    // Boosted tokens don't have pair data, so search for the top ones
    const seen = new Set<string>();
    for (const token of boosted.slice(0, 10)) {
      const key = `${token.chainId}:${token.tokenAddress}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const pairs = await dexSearch(token.tokenAddress);
        const pair = pairs[0];
        if (pair) {
          results.push(dexPairToTrending(pair));
        }
      } catch {
        // skip individual failures
      }
    }
  } catch {
    // DexScreener unavailable
  }

  // CoinGecko: trending coins (with actual price data)
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/search/trending');
    if (response.ok) {
      const data = (await response.json()) as {
        coins: { item: { id: string; name: string; symbol: string; market_cap_rank: number } }[];
      };
      const trendingItems = (data.coins ?? []).slice(0, 7);

      // Batch-fetch actual prices for all trending coins
      const coinIds = trendingItems.map(({ item }) => item.id).join(',');
      let priceMap: Record<
        string,
        { usd?: number; usd_24h_change?: number; usd_24h_vol?: number; usd_market_cap?: number }
      > = {};

      if (coinIds) {
        try {
          const priceRes = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinIds)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
          );
          if (priceRes.ok) {
            priceMap = (await priceRes.json()) as typeof priceMap;
          }
        } catch {
          // Price fetch failed — proceed with N/A prices
        }
      }

      for (const { item } of trendingItems) {
        const priceData = priceMap[item.id];
        const priceUsd = priceData?.usd;
        const change24h = priceData?.usd_24h_change ?? 0;
        const volume = priceData?.usd_24h_vol ?? 0;
        const mcap = priceData?.usd_market_cap ?? null;

        results.push({
          name: item.name,
          symbol: item.symbol.toUpperCase(),
          chain: 'multi',
          priceUsd: priceUsd !== undefined && isFinite(priceUsd) ? String(priceUsd) : '',
          priceChange24h: isFinite(change24h) ? change24h : 0,
          volume24h: isFinite(volume) ? volume : 0,
          liquidity: 0,
          marketCap: mcap !== null && isFinite(mcap) ? mcap : null,
          url: `https://www.coingecko.com/en/coins/${item.id}`,
          source: 'coingecko',
        });
      }
    }
  } catch {
    // CoinGecko unavailable
  }

  return results;
}

function dexPairToTrending(pair: DexPair): TrendingToken {
  return {
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    chain: pair.chainId,
    priceUsd: pair.priceUsd || '',
    priceChange24h: pair.priceChange?.h24 ?? 0,
    volume24h: pair.volume?.h24 ?? 0,
    liquidity: pair.liquidity?.usd ?? 0,
    marketCap: pair.marketCap ?? pair.fdv ?? null,
    url: pair.url,
    source: 'dexscreener',
  };
}

/**
 * ML-enhanced trend analysis. Falls back to rule-based analyzeTrend().
 */
export async function analyzeTrendML(data: MarketData): Promise<MarketTrend> {
  const mlClient = getMLClient();
  if (mlClient) {
    try {
      const volumeToMcap = data.marketCap > 0 ? data.volume24h / data.marketCap : 0;
      const result = await mlClient.scoreTrend({
        price_change_24h: data.priceChange24h,
        price_change_7d: data.priceChange7d,
        volume_24h: data.volume24h,
        market_cap: data.marketCap,
        volume_to_mcap_ratio: volumeToMcap,
        rank: data.rank ?? 0,
      });
      if (result) {
        const signals: string[] = [`ML trend score: ${result.score}/100 (${result.model})`];
        if (result.feature_importances) {
          const topFeature = Object.entries(result.feature_importances).sort(
            (a, b) => b[1] - a[1],
          )[0];
          if (topFeature) {
            signals.push(`Top driver: ${topFeature[0]}`);
          }
        }
        return {
          direction: result.direction,
          strength: result.score,
          signals,
        };
      }
    } catch {
      // ML unavailable — fallback
    }
  }
  return analyzeTrend(data);
}

export function analyzeTrend(data: MarketData): MarketTrend {
  const signals: string[] = [];
  let score = 50;

  if (data.priceChange24h > 5) {
    score += 15;
    signals.push(`Strong 24h gain: +${data.priceChange24h.toFixed(2)}%`);
  } else if (data.priceChange24h < -5) {
    score -= 15;
    signals.push(`Significant 24h drop: ${data.priceChange24h.toFixed(2)}%`);
  }

  if (data.priceChange7d > 10) {
    score += 20;
    signals.push(`Bullish weekly trend: +${data.priceChange7d.toFixed(2)}%`);
  } else if (data.priceChange7d < -10) {
    score -= 20;
    signals.push(`Bearish weekly trend: ${data.priceChange7d.toFixed(2)}%`);
  }

  if (data.volume24h > data.marketCap * 0.1) {
    signals.push('High volume relative to market cap');
    score += 5;
  }

  const direction: MarketTrend['direction'] =
    score > 60 ? 'bullish' : score < 40 ? 'bearish' : 'neutral';

  return {
    direction,
    strength: Math.max(0, Math.min(100, score)),
    signals,
  };
}
