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
  RugMLFeatures,
  RugMLResult,
  WalletMLFeatures,
  WalletMLResult,
  SentimentMLResult,
  TrendMLFeatures,
  TrendMLResult,
  TAMLFeatures,
  TAMLResult,
  StrategyMLFeatures,
  StrategyMLResult,
  RegimeMLFeatures,
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
  PumpDetectionMLResult,
  NarrativeMLResult,
  DivergenceMLResult,
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

  async predictRug(features: RugMLFeatures): Promise<RugMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/rug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as RugMLResult;
    } catch (err) {
      log.debug(`ML rug predict failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async classifyWallet(features: WalletMLFeatures): Promise<WalletMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as WalletMLResult;
    } catch (err) {
      log.debug(`ML wallet classify failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async analyzeSentiment(text: string): Promise<SentimentMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/sentiment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as SentimentMLResult;
    } catch (err) {
      log.debug(`ML sentiment failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async analyzeSentimentBatch(texts: string[]): Promise<SentimentMLResult[]> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/sentiment/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { results: SentimentMLResult[] };
      return data.results;
    } catch (err) {
      log.debug(`ML sentiment batch failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // v0.11.0 — New ML endpoints
  // -----------------------------------------------------------------------

  async scoreTrend(features: TrendMLFeatures): Promise<TrendMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/trend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as TrendMLResult;
    } catch (err) {
      log.debug(`ML trend score failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async interpretTA(features: TAMLFeatures): Promise<TAMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/ta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as TAMLResult;
    } catch (err) {
      log.debug(`ML TA interpret failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async evaluateStrategy(features: StrategyMLFeatures): Promise<StrategyMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as StrategyMLResult;
    } catch (err) {
      log.debug(`ML strategy eval failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async detectRegime(features: RegimeMLFeatures): Promise<RegimeMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/regime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as RegimeMLResult;
    } catch (err) {
      log.debug(`ML regime detect failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async scoreProjectRisk(features: ProjectRiskMLFeatures): Promise<ProjectRiskMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/project-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as ProjectRiskMLResult;
    } catch (err) {
      log.debug(`ML project risk failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async optimizePortfolio(features: PortfolioOptMLFeatures): Promise<PortfolioOptMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/portfolio-opt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as PortfolioOptMLResult;
    } catch (err) {
      log.debug(`ML portfolio opt failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async classifyIntent(text: string): Promise<IntentMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as IntentMLResult;
    } catch (err) {
      log.debug(`ML intent classify failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async scoreBytecodeRisk(features: BytecodeRiskMLFeatures): Promise<BytecodeRiskMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/bytecode-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as BytecodeRiskMLResult;
    } catch (err) {
      log.debug(`ML bytecode risk failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async predictPortfolioForward(
    features: PortfolioPredMLFeatures,
  ): Promise<PortfolioPredMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/predict/portfolio-forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as PortfolioPredMLResult;
    } catch (err) {
      log.debug(`ML portfolio forward failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // v0.12.0 — New ML endpoints
  // -----------------------------------------------------------------------

  async detectPump(
    token: string,
    prices: number[],
    volumes: number[],
  ): Promise<PumpDetectionMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/detect-pump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, prices, volumes }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as PumpDetectionMLResult;
    } catch (err) {
      log.debug(`ML pump detect failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async detectNarrative(texts: string[]): Promise<NarrativeMLResult[] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/detect-narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { narratives: NarrativeMLResult[] };
      return data.narratives;
    } catch (err) {
      log.debug(`ML narrative detect failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async detectDivergence(
    marketOdds: number[],
    prices: number[],
  ): Promise<DivergenceMLResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/detect-divergence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_odds: marketOdds, prices }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      return (await res.json()) as DivergenceMLResult;
    } catch (err) {
      log.debug(`ML divergence detect failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async trainModel(modelName: string, params?: Record<string, unknown>): Promise<unknown> {
    try {
      const res = await fetch(`${this.baseUrl}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, ...params }),
        signal: AbortSignal.timeout(300000), // 5 min for training
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      log.debug(`ML train failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async evaluateModel(modelName: string): Promise<unknown> {
    try {
      const res = await fetch(`${this.baseUrl}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      log.debug(`ML evaluate failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
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
