// ---------------------------------------------------------------------------
// ChronoVisor types — composite scoring, predictions, weight configuration
// ---------------------------------------------------------------------------

export interface SignalCategory {
  name: string;
  weight: number;
  score: number; // -1 to 1 (bearish to bullish)
  confidence: number; // 0-1
  sources: string[];
}

export interface SignalBreakdown {
  onChain: SignalCategory;
  mlEnsemble: SignalCategory;
  predictionMarkets: SignalCategory;
  socialNarrative: SignalCategory;
  patternMatch: SignalCategory;
}

export interface CompositeScore {
  score: number; // -1 to 1
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100
  signalBreakdown: SignalBreakdown;
  timestamp: number;
}

export interface ChronoVisorResult {
  symbol: string;
  composite: CompositeScore;
  predictions: {
    horizon: '1h' | '4h' | '1d' | '7d';
    direction: 'up' | 'down' | 'sideways';
    probability: number;
    reasoning: string[];
  }[];
  accuracy: {
    overall: number;
    byHorizon: Record<string, number>;
  } | null;
  generatedAt: number;
}

export interface WeightConfig {
  onChain: number; // default 0.30
  mlEnsemble: number; // default 0.25
  predictionMarkets: number; // default 0.20
  socialNarrative: number; // default 0.15
  patternMatch: number; // default 0.10
}

export interface PredictionRecord {
  id: string;
  symbol: string;
  horizon: string;
  predictedDirection: 'up' | 'down' | 'sideways';
  probability: number;
  compositeScore: number;
  initialPrice: number;
  createdAt: number;
  resolvedAt: number | null;
  actualDirection: 'up' | 'down' | 'sideways' | null;
  wasCorrect: boolean | null;
}
