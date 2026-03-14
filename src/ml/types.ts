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
