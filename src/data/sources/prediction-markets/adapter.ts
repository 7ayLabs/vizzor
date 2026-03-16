// ---------------------------------------------------------------------------
// Generic REST adapter for CLOB prediction markets
// Configurable via PredictionMarketConfig to connect to any REST-based API
// ---------------------------------------------------------------------------

import type { PredictionMarketSignal, PredictionMarketAdapter } from './types.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('prediction-markets');

/** Timeout for all prediction market API requests (ms). */
const REQUEST_TIMEOUT_MS = 5000;

export interface PredictionMarketConfig {
  platform: string;
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  /**
   * Mapping function from raw API response to our signal format.
   * Allows connecting to any prediction market REST API.
   */
  mapMarket: (raw: unknown) => PredictionMarketSignal;
  endpoints: {
    activeMarkets: string; // GET path
    market: string; // GET path with :id placeholder
    search: string; // GET path with ?q= query
  };
}

/**
 * A generic prediction market adapter that communicates with any
 * CLOB-style prediction market via REST endpoints.
 *
 * Momentum scores are computed by caching the last-seen probability
 * for each market and comparing against the current value.
 */
export class GenericPredictionMarketAdapter implements PredictionMarketAdapter {
  readonly platform: string;

  private readonly config: PredictionMarketConfig;

  /** Cache of previous probabilities keyed by marketId for momentum calculation. */
  private readonly probabilityCache = new Map<string, number>();

  constructor(config: PredictionMarketConfig) {
    this.config = config;
    this.platform = config.platform;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async fetchActiveMarkets(category?: string): Promise<PredictionMarketSignal[]> {
    const url = this.buildUrl(this.config.endpoints.activeMarkets);
    const finalUrl = category ? `${url}?category=${encodeURIComponent(category)}` : url;

    const data = await this.request<unknown[]>(finalUrl);
    if (!data) return [];

    return this.mapArray(data);
  }

  async fetchMarket(marketId: string): Promise<PredictionMarketSignal | null> {
    const path = this.config.endpoints.market.replace(':id', encodeURIComponent(marketId));
    const url = this.buildUrl(path);

    const data = await this.request<unknown>(url);
    if (!data) return null;

    try {
      const signal = this.config.mapMarket(data);
      return this.enrichWithMomentum(signal);
    } catch (err) {
      log.warn(
        `Failed to map market ${marketId} from ${this.platform}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async searchMarkets(query: string): Promise<PredictionMarketSignal[]> {
    const url = this.buildUrl(`${this.config.endpoints.search}?q=${encodeURIComponent(query)}`);

    const data = await this.request<unknown[]>(url);
    if (!data) return [];

    return this.mapArray(data);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildUrl(path: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private async request<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        log.warn(`${this.platform} API error: ${res.status} ${res.statusText} — ${url}`);
        return null;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        log.warn(`${this.platform} returned non-JSON content-type: ${contentType}`);
        return null;
      }

      return (await res.json()) as T;
    } catch (err) {
      log.debug(
        `${this.platform} request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Maps raw API responses through the config mapping function and enriches
   * each signal with a momentum score.
   */
  private mapArray(raw: unknown[]): PredictionMarketSignal[] {
    const signals: PredictionMarketSignal[] = [];

    for (const item of raw) {
      try {
        const signal = this.config.mapMarket(item);
        signals.push(this.enrichWithMomentum(signal));
      } catch (err) {
        log.debug(
          `Skipping unmappable market from ${this.platform}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return signals;
  }

  /**
   * Computes momentum by comparing the current probability to the last cached
   * value. Stores the current probability for the next comparison.
   */
  private enrichWithMomentum(signal: PredictionMarketSignal): PredictionMarketSignal {
    const previous = this.probabilityCache.get(signal.marketId);
    this.probabilityCache.set(signal.marketId, signal.probability);

    if (previous !== undefined) {
      // momentumScore = delta in probability since last observation
      return { ...signal, momentumScore: signal.probability - previous };
    }

    // First observation — momentum is the signal's own value (or 0 if not set)
    return signal;
  }
}
