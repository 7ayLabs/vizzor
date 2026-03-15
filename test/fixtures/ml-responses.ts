// ---------------------------------------------------------------------------
// Mock ML sidecar responses for testing
// ---------------------------------------------------------------------------

import type {
  MLPredictionResult,
  RugMLResult,
  WalletMLResult,
  SentimentMLResult,
  TrendMLResult,
  TAMLResult,
  StrategyMLResult,
  RegimeMLResult,
  ProjectRiskMLResult,
  BytecodeRiskMLResult,
  PortfolioOptMLResult,
  IntentMLResult,
  PortfolioPredMLResult,
  AnomalyResult,
  ModelHealth,
} from '../../src/ml/types.js';

export const mockPrediction: MLPredictionResult = {
  symbol: 'BTC',
  direction: 'up',
  probability: 0.72,
  model: 'lstm-predictor',
  horizon: '1h',
  confidence: 72,
  features: { rsi: 45, macd: 0.02 },
};

export const mockRugResult: RugMLResult = {
  rug_probability: 0.15,
  risk_level: 'low',
  risk_factors: [{ factor: 'holder_concentration', importance: 0.3, value: 0.4 }],
  model: 'rug-detector-gbm',
};

export const mockWalletResult: WalletMLResult = {
  behavior_type: 'normal_trader',
  confidence: 0.85,
  risk_score: 0.2,
  secondary_type: null,
  indicators: ['regular_intervals', 'moderate_values'],
  model: 'wallet-classifier-lstm',
};

export const mockSentimentResult: SentimentMLResult = {
  sentiment: 'bullish',
  confidence: 0.78,
  score: 0.65,
  key_topics: ['defi', 'ethereum'],
  model: 'sentiment-distilbert',
};

export const mockTrendResult: TrendMLResult = {
  score: 72,
  direction: 'bullish',
  confidence: 0.8,
  feature_importances: { price_change_24h: 0.4, volume_24h: 0.3 },
  model: 'trend-scorer-rf',
};

export const mockTAResult: TAMLResult = {
  signals: [{ name: 'RSI', direction: 'bullish', strength: 70, description: 'RSI oversold' }],
  weights: { RSI: 0.25, MACD: 0.2 },
  composite: { direction: 'bullish', score: 65, confidence: 0.75 },
  model: 'ta-interpreter-rf',
};

export const mockStrategyResult: StrategyMLResult = {
  action: 'buy',
  confidence: 78,
  position_size_pct: 5,
  reasoning: ['Strong RSI signal', 'Bullish regime'],
  model: 'strategy-bandit-rl',
};

export const mockRegimeResult: RegimeMLResult = {
  regime: 'trending_bull',
  confidence: 0.82,
  probabilities: {
    trending_bull: 0.82,
    trending_bear: 0.05,
    ranging: 0.08,
    volatile: 0.03,
    capitulation: 0.02,
  },
  model: 'regime-hmm',
};

export const mockProjectRiskResult: ProjectRiskMLResult = {
  risk_probability: 0.25,
  risk_level: 'medium',
  risk_factors: [{ factor: 'holder_concentration', importance: 0.4, value: 0.6 }],
  model: 'project-risk-gbm',
};

export const mockBytecodeRiskResult: BytecodeRiskMLResult = {
  rug_probability: 0.1,
  risk_level: 'low',
  risk_factors: [],
  model: 'bytecode-risk-gbm',
};

export const mockPortfolioOptResult: PortfolioOptMLResult = {
  position_size_pct: 5,
  stop_loss_multiplier: 2.0,
  take_profit_multiplier: 3.0,
  max_allocation_pct: 10,
  reasoning: ['Conservative sizing for volatile regime'],
  model: 'portfolio-opt-rl',
};

export const mockIntentResult: IntentMLResult = {
  intent: 'price_check',
  confidence: 0.92,
  secondary_intent: null,
  detected_tokens: ['BTC'],
  detected_addresses: [],
  model: 'intent-bert',
};

export const mockPortfolioPredResult: PortfolioPredMLResult = {
  predicted_return: 0.05,
  predicted_sharpe: 1.2,
  predicted_max_drawdown: 8.5,
  confidence: 0.7,
  model: 'portfolio-pred-lstm',
};

export const mockAnomalyResults: AnomalyResult[] = [
  {
    symbol: 'BTC',
    score: 0.95,
    isAnomaly: true,
    type: 'whale_transfer',
    details: 'Large transfer detected',
  },
];

export const mockModelHealth: ModelHealth = {
  models: [
    {
      name: 'lstm-predictor',
      version: '1.0',
      loaded: true,
      lastTrained: '2024-01-01',
      accuracy: 0.68,
    },
    {
      name: 'rug-detector',
      version: '1.0',
      loaded: true,
      lastTrained: '2024-01-01',
      accuracy: 0.82,
    },
  ],
  uptime: 3600,
  predictionsServed: 1500,
};
