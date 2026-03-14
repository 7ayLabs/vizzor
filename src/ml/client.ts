// ---------------------------------------------------------------------------
// ML Sidecar HTTP client — communicates with the Python FastAPI sidecar
// ---------------------------------------------------------------------------

import { createLogger } from '../utils/logger.js';
import type {
  FeatureVector,
  MLPredictionResult,
  AnomalyResult,
  ModelHealth,
  TokenFlow,
} from './types.js';

const log = createLogger('ml-client');

export class MLClient {
  private baseUrl: string;
  private healthy = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async predict(features: FeatureVector): Promise<MLPredictionResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as MLPredictionResult;
    } catch (err) {
      log.debug(`ML predict failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async batchPredict(features: FeatureVector[]): Promise<MLPredictionResult[]> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { predictions: MLPredictionResult[] };
      return data.predictions;
    } catch (err) {
      log.debug(`ML batch predict failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async detectAnomalies(flows: TokenFlow[]): Promise<AnomalyResult[]> {
    try {
      const res = await fetch(`${this.baseUrl}/anomalies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flows }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { anomalies: AnomalyResult[] };
      return data.anomalies;
    } catch (err) {
      log.debug(`ML anomaly detection failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      this.healthy = res.ok;
      return this.healthy;
    } catch {
      this.healthy = false;
      return false;
    }
  }

  async getModelHealth(): Promise<ModelHealth | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      return (await res.json()) as ModelHealth;
    } catch {
      return null;
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor — lazy-initialized from config
// ---------------------------------------------------------------------------

let mlClient: MLClient | null = null;

export function initMLClient(url: string): MLClient {
  mlClient = new MLClient(url);
  return mlClient;
}

export function getMLClient(): MLClient | null {
  return mlClient;
}
