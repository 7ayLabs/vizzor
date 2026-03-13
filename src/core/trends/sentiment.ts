// ---------------------------------------------------------------------------
// Sentiment analysis — aggregates CryptoPanic news + DexScreener buy/sell data
// ---------------------------------------------------------------------------

import { fetchCryptoNews } from '../../data/sources/cryptopanic.js';
import { searchTokens } from '../../data/sources/dexscreener.js';
import { getConfig } from '../../config/loader.js';

export interface SentimentData {
  source: string;
  score: number; // -1 to 1
  volume: number;
  trending: boolean;
  topMentions: string[];
}

export interface SentimentSummary {
  overall: number; // -1 to 1
  sources: SentimentData[];
  consensus: 'positive' | 'negative' | 'mixed' | 'neutral';
}

/**
 * Analyze sentiment for a token/topic by aggregating:
 * 1. CryptoPanic news sentiment
 * 2. DexScreener buy/sell ratio (market sentiment proxy)
 */
export async function analyzeSentiment(query: string): Promise<SentimentSummary> {
  const sources: SentimentData[] = [];

  // 1. CryptoPanic news sentiment
  try {
    let apiToken: string | undefined;
    try {
      apiToken = getConfig().cryptopanicApiKey;
    } catch {
      /* config not loaded */
    }
    const news = await fetchCryptoNews(query, apiToken);
    if (news.length > 0) {
      let positiveCount = 0;
      let negativeCount = 0;
      for (const article of news) {
        if (article.sentiment === 'positive') positiveCount++;
        else if (article.sentiment === 'negative') negativeCount++;
      }
      const total = news.length;
      const newsScore = total > 0 ? (positiveCount - negativeCount) / total : 0;

      sources.push({
        source: 'CryptoPanic News',
        score: newsScore,
        volume: total,
        trending: total > 5,
        topMentions: news.slice(0, 3).map((n) => n.title),
      });
    }
  } catch {
    // CryptoPanic unavailable
  }

  // 2. DexScreener buy/sell ratio
  try {
    const pairs = await searchTokens(query);
    const topPair = pairs[0];
    if (topPair) {
      const buys24h = topPair.txns?.h24?.buys ?? 0;
      const sells24h = topPair.txns?.h24?.sells ?? 0;
      const totalTxns = buys24h + sells24h;

      let dexScore = 0;
      if (totalTxns > 0) {
        // Buy ratio: 0-1, centered at 0.5 → score: -1 to 1
        dexScore = (buys24h / totalTxns - 0.5) * 2;
      }

      const priceChange = topPair.priceChange?.h24 ?? 0;

      sources.push({
        source: 'DexScreener Market',
        score: dexScore,
        volume: totalTxns,
        trending: topPair.volume?.h24 > 100000,
        topMentions: [
          `${topPair.baseToken.symbol}: $${topPair.priceUsd ?? '?'}`,
          `24h: ${buys24h} buys / ${sells24h} sells`,
          `Price change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
        ],
      });
    }
  } catch {
    // DexScreener unavailable
  }

  // Aggregate
  if (sources.length === 0) {
    return { overall: 0, sources: [], consensus: 'neutral' };
  }

  const totalScore = sources.reduce((sum, s) => sum + s.score, 0);
  const overall = totalScore / sources.length;

  let consensus: SentimentSummary['consensus'] = 'neutral';
  if (overall > 0.2) consensus = 'positive';
  else if (overall < -0.2) consensus = 'negative';
  else if (sources.length > 1 && Math.abs(sources[0]!.score - sources[1]!.score) > 0.5) {
    consensus = 'mixed';
  }

  return { overall, sources, consensus };
}
