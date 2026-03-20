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
  logicRules: SignalCategory;
}

export interface CompositeScore {
  score: number; // -1 to 1
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-100
  signalBreakdown: SignalBreakdown;
  timestamp: number;
}

/** Supported prediction horizons — scalping (5m/15m/30m) + standard (1h/4h/1d/7d). */
export type PredictionHorizon = '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '7d';

export interface ChronoVisorResult {
  symbol: string;
  composite: CompositeScore;
  predictions: {
    horizon: PredictionHorizon;
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
  onChain: number; // default 0.25
  mlEnsemble: number; // default 0.20
  predictionMarkets: number; // default 0.15
  socialNarrative: number; // default 0.10
  patternMatch: number; // default 0.05
  logicRules: number; // default 0.15
}

/** Snapshot of each signal's CF and direction at prediction time (for per-signal accuracy). */
export type SignalSnapshot = Record<string, { cf: number; direction: string }>;

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
  signalSnapshot: SignalSnapshot | null;
}
