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

// ---------------------------------------------------------------------------
// v0.11.0 — Comprehensive ML integration types
// ---------------------------------------------------------------------------

export interface TrendMLFeatures {
  price_change_24h: number;
  price_change_7d: number;
  volume_24h: number;
  market_cap: number;
  volume_to_mcap_ratio: number;
  rank: number;
}

export interface TrendMLResult {
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  feature_importances: Record<string, number>;
  model: string;
}

export interface TAMLFeatures {
  rsi: number;
  macd_histogram: number;
  macd_line: number;
  macd_signal: number;
  bb_percent_b: number;
  bb_bandwidth: number;
  ema12: number;
  ema26: number;
  ema_cross_pct: number;
  atr: number;
  atr_pct: number;
  obv: number;
  price_change: number;
}

export interface TAMLSignal {
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  description: string;
}

export interface TAMLResult {
  signals: TAMLSignal[];
  weights: Record<string, number>;
  composite: { direction: 'bullish' | 'bearish' | 'neutral'; score: number; confidence: number };
  model: string;
}

export interface StrategyMLFeatures {
  rsi: number;
  macd_histogram: number;
  ema12: number;
  ema26: number;
  bollinger_pct_b: number;
  atr: number;
  obv: number;
  funding_rate: number;
  fear_greed: number;
  price_change_24h: number;
  price: number;
  regime: string;
}

export interface StrategyMLResult {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  position_size_pct: number;
  reasoning: string[];
  model: string;
}

export interface RegimeMLFeatures {
  returns_1d: number;
  returns_7d: number;
  volatility_14d: number;
  volume_ratio: number;
  rsi: number;
  bb_width: number;
  fear_greed: number;
  funding_rate: number;
  price_vs_sma200: number;
}

export type MarketRegime =
  | 'trending_bull'
  | 'trending_bear'
  | 'ranging'
  | 'volatile'
  | 'capitulation';

export interface RegimeMLResult {
  regime: MarketRegime;
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
}

export interface ProjectRiskMLFeatures {
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
  has_token_info: number;
}

export interface ProjectRiskMLResult {
  risk_probability: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: { factor: string; importance: number; value: number }[];
  model: string;
}

export interface PortfolioOptMLFeatures {
  total_value: number;
  cash: number;
  win_rate: number;
  max_drawdown: number;
  avg_win: number;
  avg_loss: number;
  regime: string;
  atr_pct: number;
}

export interface PortfolioOptMLResult {
  position_size_pct: number;
  stop_loss_multiplier: number;
  take_profit_multiplier: number;
  max_allocation_pct: number;
  reasoning: string[];
  model: string;
}

export interface IntentMLResult {
  intent: string;
  confidence: number;
  secondary_intent: string | null;
  detected_tokens: string[];
  detected_addresses: string[];
  model: string;
}

export interface BytecodeRiskMLFeatures {
  bytecode_size: number;
  is_verified: number;
  has_selfdestruct: number;
  has_delegatecall: number;
  selector_count: number;
  opcode_entropy: number;
  has_mint: number;
  has_pause: number;
  has_blacklist: number;
  has_proxy: number;
}

export interface BytecodeRiskMLResult {
  rug_probability: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: { factor: string; importance: number; value: number }[];
  model: string;
}

export interface PortfolioPredMLFeatures {
  returns_history: number[];
  sharpe_history: number[];
  drawdown_history: number[];
}

export interface PortfolioPredMLResult {
  predicted_return: number;
  predicted_sharpe: number;
  predicted_max_drawdown: number;
  confidence: number;
  model: string;
}

export interface TrainResult {
  model: string;
  status: 'success' | 'failed';
  metrics: Record<string, number>;
  duration_seconds: number;
  artifact_path: string;
}

export interface EvalResult {
  model: string;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1: number;
    auc_roc: number;
  };
  confusion_matrix: number[][];
  test_samples: number;
}
