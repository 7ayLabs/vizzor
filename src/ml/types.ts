// ---------------------------------------------------------------------------
// ML module types — shared between feature engineer, client, and predictor
// ---------------------------------------------------------------------------

export interface FeatureVector {
  // From existing TechnicalAnalysis
  rsi: number;
  macdHistogram: number;
  bollingerPercentB: number;
  ema12: number;
  ema26: number;
  atr: number;
  obv: number;
  // From existing AgentSignals
  fundingRate: number;
  fearGreed: number;
  priceChange24h: number;
  // Derived features
  rsiSlope: number; // RSI rate of change over 3 periods
  volumeRatio: number; // current / 20-period avg volume
  emaCrossoverPct: number; // (EMA12-EMA26)/price as %
  atrPct: number; // ATR as % of price
  // Metadata
  symbol: string;
  timestamp: number;
}

export interface MLPredictionResult {
  symbol: string;
  direction: 'up' | 'down' | 'sideways';
  probability: number; // 0-1
  model: string;
  horizon: string; // '1h' | '4h' | '1d'
  confidence: number; // 0-100
  features: Record<string, number>;
}

export interface AnomalyResult {
  symbol: string;
  score: number; // 0-1, higher = more anomalous
  isAnomaly: boolean;
  type: 'whale_transfer' | 'volume_spike' | 'funding_deviation' | 'unknown';
  details: string;
}

export interface ModelHealth {
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

export interface TokenFlow {
  symbol: string;
  amount: number;
  from: string;
  to: string;
  timestamp: number;
  type: 'transfer' | 'swap' | 'bridge';
}

export interface RugMLFeatures {
  bytecode_size: number;
  is_verified: number;
  holder_concentration: number;
  has_proxy: number;
  has_mint: number;
  has_pause: number;
  has_blacklist: number;
  liquidity_locked: number;
  buy_tax: number;
  sell_tax: number;
  contract_age_days: number;
  total_transfers: number;
  owner_balance_pct: number;
  is_open_source: number;
  top10_holder_pct: number;
}

export interface RugMLResult {
  rug_probability: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: { factor: string; importance: number; value: number }[];
  model: string;
}

export interface WalletMLFeatures {
  tx_count: number;
  avg_value_eth: number;
  max_value_eth: number;
  avg_gas_used: number;
  unique_recipients: number;
  unique_methods: number;
  time_span_hours: number;
  avg_interval_seconds: number;
  min_interval_seconds: number;
  contract_interaction_pct: number;
  self_transfer_pct: number;
  high_value_tx_pct: number;
  failed_tx_pct: number;
  token_diversity: number;
}

export interface WalletMLResult {
  behavior_type: string;
  confidence: number;
  risk_score: number;
  secondary_type: string | null;
  indicators: string[];
  model: string;
}

export interface SentimentMLResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  score: number;
  key_topics: string[];
  model: string;
}
