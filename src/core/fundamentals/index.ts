// ---------------------------------------------------------------------------
// Blockchain Fundamentals barrel export — v0.12.5
// ---------------------------------------------------------------------------

export {
  analyzeBlockchainFundamentals,
  analyzeHalvingCycle,
  computeHashRibbon,
  analyzeNetworkHealth,
  FUNDAMENTAL_WEIGHT_BY_HORIZON,
} from './blockchain-analyzer.js';
export type {
  BlockchainFundamentalsResult,
  HalvingCycleResult,
  NetworkHealthSignal,
  OnChainValuationSignal,
  SupplyDynamicsSignal,
  PredictionHorizon,
} from './types.js';
