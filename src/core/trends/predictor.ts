import type { MarketData, MarketTrend } from './market.js';
import type { SentimentSummary } from './sentiment.js';

export interface Prediction {
  direction: 'up' | 'down' | 'sideways';
  confidence: number; // 0-100
  timeframe: string;
  reasoning: string[];
  disclaimer: string;
}

export function generatePrediction(
  trend: MarketTrend,
  _sentiment: SentimentSummary,
  data: MarketData,
): Prediction {
  const reasoning: string[] = [];

  let direction: Prediction['direction'] = 'sideways';
  let confidence = 30;

  if (trend.direction === 'bullish') {
    direction = 'up';
    confidence += 20;
    reasoning.push(`Market trend is bullish with strength ${trend.strength}/100`);
  } else if (trend.direction === 'bearish') {
    direction = 'down';
    confidence += 20;
    reasoning.push(`Market trend is bearish with strength ${trend.strength}/100`);
  }

  if (data.volume24h > 0) {
    reasoning.push(`24h volume: $${(data.volume24h / 1e6).toFixed(2)}M`);
  }

  reasoning.push(...trend.signals);

  return {
    direction,
    confidence: Math.min(85, confidence),
    timeframe: '7 days',
    reasoning,
    disclaimer:
      'This is not financial advice. Predictions are based on historical data and AI analysis. Always do your own research.',
  };
}
