// ---------------------------------------------------------------------------
// Sentiment analysis — aggregates CryptoPanic news + DexScreener buy/sell data
// ---------------------------------------------------------------------------

import { fetchCryptoNews } from '../../data/sources/cryptopanic.js';
import { searchTokens } from '../../data/sources/dexscreener.js';
import { getConfig } from '../../config/loader.js';
import { getMLClient, initMLClient } from '../../ml/client.js';

export interface SentimentData {
  source: string;
  score: number; // -1 to 1
  volume: number;
  trending: boolean;
  topMentions: string[];
  mlSentiment?: string;
  mlConfidence?: number;
  mlTopics?: string[];
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

  // 1. CryptoPanic news sentiment (enhanced with ML NLP when available)
  try {
    let apiToken: string | undefined;
    try {
      apiToken = getConfig().cryptopanicApiKey;
    } catch {
      /* config not loaded */
    }
    const news = await fetchCryptoNews(query, apiToken);
    if (news.length > 0) {
      // Try ML sentiment analysis on headlines
      let mlClient = getMLClient();
      if (!mlClient) {
        try {
          const cfg = getConfig();
          if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
            mlClient = initMLClient(cfg.ml.sidecarUrl);
          }
        } catch {
          /* config not loaded */
        }
      }

      let newsScore: number;
      let mlSentiment: string | undefined;
      let mlConfidence: number | undefined;
      let mlTopics: string[] | undefined;

      if (mlClient) {
        // Use ML NLP for deeper sentiment analysis
        const headlines = news.slice(0, 10).map((n) => n.title);
        const mlResults = await mlClient.analyzeSentimentBatch(headlines);
        if (mlResults.length > 0) {
          const avgScore = mlResults.reduce((s, r) => s + r.score, 0) / mlResults.length;
          const avgConf = mlResults.reduce((s, r) => s + r.confidence, 0) / mlResults.length;
          const allTopics = [...new Set(mlResults.flatMap((r) => r.key_topics))];
          newsScore = avgScore;
          mlSentiment = avgScore > 0.2 ? 'bullish' : avgScore < -0.2 ? 'bearish' : 'neutral';
          mlConfidence = avgConf;
          mlTopics = allTopics.slice(0, 5);
        } else {
          // Fallback to vote counts
          newsScore = countBasedScore(news);
        }
      } else {
        newsScore = countBasedScore(news);
      }

      const total = news.length;
      sources.push({
        source: mlSentiment ? 'ML NLP Sentiment' : 'CryptoPanic News',
        score: newsScore,
        volume: total,
        trending: total > 5,
        topMentions: news.slice(0, 3).map((n) => n.title),
        mlSentiment,
        mlConfidence,
        mlTopics,
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

function countBasedScore(news: { sentiment?: string }[]): number {
  let pos = 0;
  let neg = 0;
  for (const article of news) {
    if (article.sentiment === 'positive') pos++;
    else if (article.sentiment === 'negative') neg++;
  }
  const total = news.length;
  return total > 0 ? (pos - neg) / total : 0;
}
