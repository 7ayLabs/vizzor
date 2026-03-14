// ---------------------------------------------------------------------------
// ML module barrel export
// ---------------------------------------------------------------------------

export type {
  FeatureVector,
  MLPredictionResult,
  AnomalyResult,
  ModelHealth,
  TokenFlow,
} from './types.js';
export { buildFeatureVector } from './feature-engineer.js';
export { MLClient, initMLClient, getMLClient } from './client.js';
