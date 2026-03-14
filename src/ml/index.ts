// ---------------------------------------------------------------------------
// ML module barrel export
// ---------------------------------------------------------------------------

export type {
  FeatureVector,
  MLPredictionResult,
  AnomalyResult,
  ModelHealth,
  TokenFlow,
  RugMLFeatures,
  RugMLResult,
  WalletMLFeatures,
  WalletMLResult,
  SentimentMLResult,
  TrendMLFeatures,
  TrendMLResult,
  TAMLFeatures,
  TAMLSignal,
  TAMLResult,
  StrategyMLFeatures,
  StrategyMLResult,
  RegimeMLFeatures,
  MarketRegime,
  RegimeMLResult,
  ProjectRiskMLFeatures,
  ProjectRiskMLResult,
  PortfolioOptMLFeatures,
  PortfolioOptMLResult,
  IntentMLResult,
  BytecodeRiskMLFeatures,
  BytecodeRiskMLResult,
  PortfolioPredMLFeatures,
  PortfolioPredMLResult,
} from './types.js';
export { buildFeatureVector } from './feature-engineer.js';
export { MLClient, initMLClient, getMLClient } from './client.js';
