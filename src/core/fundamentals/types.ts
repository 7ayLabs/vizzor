// ---------------------------------------------------------------------------
// Blockchain Fundamentals types — v0.12.5
// ---------------------------------------------------------------------------

export interface HalvingCycleResult {
  score: number;
  phase: 'accumulation' | 'early_markup' | 'late_markup' | 'distribution' | 'markdown';
  cycleProgress: number;
  daysInCycle: number;
  daysToNextHalving: number;
  dampening: number;
  reasoning: string;
}

export interface NetworkHealthSignal {
  score: number;
  hashRibbonSignal: 'capitulation' | 'golden_cross' | 'neutral';
  hashrate30dMA: number;
  hashrate60dMA: number;
  mempoolHealth: string;
  reasoning: string;
}

export interface OnChainValuationSignal {
  score: number;
  nvtRatio: number;
  mvrvZScore: number;
  nvtSignal: string;
  mvrvSignal: string;
  reasoning: string;
}

export interface SupplyDynamicsSignal {
  score: number;
  inflationRate: number;
  feeRevenueShare: number;
  percentMined: number;
  reasoning: string;
}

export interface BlockchainFundamentalsResult {
  symbol: string;
  halvingCycle: HalvingCycleResult;
  networkHealth: NetworkHealthSignal;
  onChainValuation: OnChainValuationSignal;
  supplyDynamics: SupplyDynamicsSignal;
  composite: {
    score: number;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  overrideApplied: string | null;
  reasoning: string[];
}

export type PredictionHorizon = '1h' | '4h' | '1d' | '7d';
