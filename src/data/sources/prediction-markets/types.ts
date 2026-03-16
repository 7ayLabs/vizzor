// ---------------------------------------------------------------------------
// Prediction market types — signal format and adapter interface
// ---------------------------------------------------------------------------

export interface PredictionMarketSignal {
  platform: string;
  marketId: string;
  question: string;
  category: string;
  probability: number; // 0-1
  volume: number; // USD
  liquidity: number;
  momentumScore: number; // rate of probability change
  relatedTokens: string[];
  timestamp: number;
}

export interface PredictionMarketAdapter {
  readonly platform: string;
  fetchActiveMarkets(category?: string): Promise<PredictionMarketSignal[]>;
  fetchMarket(marketId: string): Promise<PredictionMarketSignal | null>;
  searchMarkets(query: string): Promise<PredictionMarketSignal[]>;
}

/** Categories for crypto prediction markets */
export type MarketCategory =
  | 'crypto_price'
  | 'defi'
  | 'regulation'
  | 'adoption'
  | 'technology'
  | 'other';
