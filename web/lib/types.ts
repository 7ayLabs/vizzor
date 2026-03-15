// Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallResult[];
  timestamp: number;
  isStreaming?: boolean;
}

export interface ToolCallResult {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  status: 'pending' | 'done' | 'error';
}

export interface Agent {
  id?: string;
  name: string;
  strategy: string;
  pairs: string[];
  interval: number;
  status: string;
  cycleCount: number;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
}

export interface Trade {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  openedAt: string;
  closedAt: string;
}

// GET /v1/market/price/:symbol
export interface MarketPrice {
  symbol: string;
  name?: string;
  price: number;
  priceChange24h: number | null;
  priceChange7d?: number | null;
  volume24h: number | null;
  marketCap: number | null;
  rank?: number | null;
  source?: string;
}

// GET /v1/market/fear-greed → { current, previous, history }
export interface FearGreedEntry {
  value: number;
  classification: string;
}

export interface FearGreedData {
  current: FearGreedEntry;
  previous: FearGreedEntry;
  history?: FearGreedEntry[];
}

// GET /v1/market/trending → { trending: [...] }
export interface TrendingToken {
  rank?: number;
  symbol: string;
  name: string;
  chain: string;
  dex?: string;
  priceUsd: string;
  priceChange24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  liquidity?: number | null;
  buys24h?: number;
  sells24h?: number;
  pairAddress?: string;
  url?: string;
}

export interface NewsItem {
  title: string;
  source: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'bullish' | 'bearish';
  publishedAt: string;
  url: string;
}

// GET /v1/market/prediction?symbol=X
export interface Prediction {
  symbol: string;
  direction: 'up' | 'down' | 'sideways';
  confidence: number;
  composite: number;
  timeframe?: string;
  signals?: Record<string, number>;
  reasoning?: string[];
  mlAvailable?: boolean;
  disclaimer?: string;
}

// GET /v1/market/derivatives/:symbol
export interface DerivativesData {
  symbol: string;
  openInterest: number | null;
  openInterestNotional?: number | null;
  fundingRate?: number | null;
  markPrice?: number | null;
  longShortRatio?: number | null;
}

// GET /v1/analysis/technical/:symbol
export interface TechnicalAnalysis {
  symbol: string;
  timeframe?: string;
  composite: {
    direction: string;
    score: number;
    confidence: number;
  };
  signals?: { name: string; value: number; strength: string }[];
  indicators: {
    rsi: number;
    macd: { macd: number; signal: number; histogram: number };
    bollingerBands: { upper: number; middle: number; lower: number; percentB: number };
    ema12?: number;
    ema26?: number;
    atr?: number;
  };
}

// POST /v1/security/token
export interface TokenSecurity {
  contractAddress: string;
  chain: string;
  riskLevel: 'safe' | 'warning' | 'danger';
  isHoneypot: boolean;
  isMintable: boolean;
  buyTax: number;
  sellTax: number;
  isOpenSource: boolean;
  isProxy: boolean;
  hiddenOwner: boolean;
  cannotBuy: boolean;
  cannotSellAll: boolean;
  isBlacklisted: boolean;
  holderCount: number;
  lpHolderCount: number;
  creatorPercent: number;
  ownerPercent: number;
  trustList: boolean;
}

// POST /v1/security/rug-check
export interface RugIndicators {
  isHoneypot: boolean;
  hasLiquidityLock: boolean;
  ownerCanMint: boolean;
  ownerCanPause: boolean;
  hasBlacklist: boolean;
  highSellTax: boolean;
  riskScore: number;
  details: {
    check: string;
    passed: boolean;
    description: string;
    severity: 'info' | 'warning' | 'critical';
  }[];
}

// POST /v1/security/wallet
export interface WalletAnalysis {
  address: string;
  chain: string;
  balance: string;
  transactionCount: number;
  riskLevel: 'clean' | 'suspicious' | 'flagged';
  patterns: { type: string; description: string; severity: 'info' | 'warning' | 'danger' }[];
  tokenBalances?: { symbol: string; address: string; balance: string }[];
}

// GET /v1/market/ml-health
export interface MLHealth {
  available: boolean;
  models: {
    name: string;
    version: string;
    loaded: boolean;
    lastTrained: string | null;
    accuracy: number | null;
  }[];
  uptime: number;
  predictionsServed: number;
}

// POST /v1/market/ml/regime
export interface RegimeResult {
  regime: 'trending_bull' | 'trending_bear' | 'ranging' | 'volatile' | 'capitulation';
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
}

// POST /v1/market/ml/sentiment
export interface SentimentResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  score: number;
  key_topics: string[];
  model: string;
}

// POST /v1/market/ml/trend
export interface TrendResult {
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  feature_importances: Record<string, number>;
  model: string;
}
