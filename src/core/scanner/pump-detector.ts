// ---------------------------------------------------------------------------
// PumpDetector — CUSUM anomaly detection on 1-min micro-timeframes
// Detects pump/dump events and suspicious volume spikes in real-time
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';
import { emitNotification } from '../../notifications/event-bus.js';

const log = createLogger('pump-detector');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PumpSignal {
  token: string;
  type: 'pump' | 'dump' | 'suspicious_volume';
  severity: 'low' | 'medium' | 'high' | 'critical';
  cusum: number; // CUSUM statistic value
  threshold: number; // threshold that was exceeded
  priceChangePct: number; // price change during event
  volumeSpike: number; // volume relative to baseline
  duration: number; // seconds since detection start
  startedAt: number;
  detectedAt: number;
}

// ---------------------------------------------------------------------------
// CUSUM parameters
// ---------------------------------------------------------------------------

export interface CUSUMParams {
  /** Expected return mean (0 for stationary price series) */
  targetMean: number;
  /** Slack parameter (k) — sensitivity tuning */
  allowance: number;
  /** Decision interval (h) — alarm threshold */
  threshold: number;
  /** Rolling window size in samples (default 60 for 1-min @ 1s) */
  windowSize: number;
}

const DEFAULT_CUSUM_PARAMS: CUSUMParams = {
  targetMean: 0, // expected return (0 for stationary)
  allowance: 0.5, // slack parameter (k)
  threshold: 4, // decision interval (h)
  windowSize: 60, // 1-minute window (60 samples at 1s)
} as const;

/** Volume spike multiplier to flag as suspicious */
const VOLUME_SPIKE_MULTIPLIER = 5;

/** Cooldown period in ms after a detection before re-alerting same token */
const DETECTION_COOLDOWN_MS = 60000; // 1 minute

/** Minimum samples needed before baseline is reliable */
const MIN_BASELINE_SAMPLES = 10;

// ---------------------------------------------------------------------------
// Per-token CUSUM state
// ---------------------------------------------------------------------------

interface TokenState {
  prices: number[];
  volumes: number[];
  cusumUp: number;
  cusumDown: number;
  baseline: {
    avgReturn: number;
    avgVolume: number;
  };
  lastDetectionAt: number;
  firstSampleAt: number;
}

// ---------------------------------------------------------------------------
// PumpDetector
// ---------------------------------------------------------------------------

export class PumpDetector {
  private params: CUSUMParams;
  private states = new Map<string, TokenState>();
  private activeAlerts: PumpSignal[] = [];
  private history = new Map<string, PumpSignal[]>();

  constructor(params?: Partial<CUSUMParams>) {
    this.params = { ...DEFAULT_CUSUM_PARAMS, ...params };
  }

  /**
   * Feed a new price/volume observation for a token.
   * Returns a PumpSignal if an anomaly is detected, null otherwise.
   */
  feed(token: string, price: number, volume: number, timestamp: number): PumpSignal | null {
    const state = this.getOrCreateState(token, price, volume, timestamp);

    // Need at least 2 prices to calculate returns
    if (state.prices.length < 2) {
      return null;
    }

    const lastPrice = state.prices[state.prices.length - 2];
    if (lastPrice === undefined || lastPrice === 0) {
      return null;
    }

    // Calculate 1-sample return
    const sampleReturn = (price - lastPrice) / lastPrice;

    // Update baseline with rolling window
    this.updateBaseline(state);

    // Check if we have enough samples for reliable baseline
    if (state.prices.length < MIN_BASELINE_SAMPLES) {
      return null;
    }

    // Update CUSUM statistics
    // S_up = max(0, S_up + (return - target - allowance))
    state.cusumUp = Math.max(
      0,
      state.cusumUp + (sampleReturn - this.params.targetMean - this.params.allowance / 100),
    );

    // S_down = max(0, S_down + (-return + target - allowance))
    state.cusumDown = Math.max(
      0,
      state.cusumDown + (-sampleReturn + this.params.targetMean - this.params.allowance / 100),
    );

    // Check for volume spike
    const volumeSpike = state.baseline.avgVolume > 0 ? volume / state.baseline.avgVolume : 0;

    // Check cooldown
    if (timestamp - state.lastDetectionAt < DETECTION_COOLDOWN_MS) {
      return null;
    }

    // Detect anomalies
    let signal: PumpSignal | null = null;

    const scaledThreshold = this.params.threshold / 100;

    if (state.cusumUp > scaledThreshold) {
      // Pump detected
      signal = this.createSignal(
        token,
        'pump',
        state.cusumUp,
        scaledThreshold,
        this.calculatePriceChange(state),
        volumeSpike,
        state,
        timestamp,
      );

      // Reset CUSUM after detection
      state.cusumUp = 0;
      state.lastDetectionAt = timestamp;
    } else if (state.cusumDown > scaledThreshold) {
      // Dump detected
      signal = this.createSignal(
        token,
        'dump',
        state.cusumDown,
        scaledThreshold,
        this.calculatePriceChange(state),
        volumeSpike,
        state,
        timestamp,
      );

      // Reset CUSUM after detection
      state.cusumDown = 0;
      state.lastDetectionAt = timestamp;
    } else if (volumeSpike > VOLUME_SPIKE_MULTIPLIER) {
      // Suspicious volume with no clear price direction
      signal = this.createSignal(
        token,
        'suspicious_volume',
        Math.max(state.cusumUp, state.cusumDown),
        scaledThreshold,
        this.calculatePriceChange(state),
        volumeSpike,
        state,
        timestamp,
      );

      state.lastDetectionAt = timestamp;
    }

    if (signal) {
      this.recordSignal(signal);

      emitNotification({
        type: 'pump_detected',
        title: `${signal.type.toUpperCase()} Detected: ${token}`,
        message: `${signal.severity.toUpperCase()} ${signal.type} — price ${signal.priceChangePct > 0 ? '+' : ''}${signal.priceChangePct.toFixed(2)}%, volume ${signal.volumeSpike.toFixed(1)}x`,
        severity:
          signal.severity === 'critical' || signal.severity === 'high'
            ? 'critical'
            : signal.severity === 'medium'
              ? 'warning'
              : 'info',
        symbol: token,
        metadata: {
          type: signal.type,
          severity: signal.severity,
          cusum: signal.cusum,
          priceChangePct: signal.priceChangePct,
          volumeSpike: signal.volumeSpike,
          duration: signal.duration,
        },
      });

      log.info(
        `${signal.type.toUpperCase()} detected for ${token}: severity=${signal.severity}, ` +
          `cusum=${signal.cusum.toFixed(4)}, priceChange=${signal.priceChangePct.toFixed(2)}%, ` +
          `volumeSpike=${signal.volumeSpike.toFixed(1)}x`,
      );
    }

    // Trim window to prevent unbounded growth
    if (state.prices.length > this.params.windowSize * 2) {
      state.prices = state.prices.slice(-this.params.windowSize);
      state.volumes = state.volumes.slice(-this.params.windowSize);
    }

    return signal;
  }

  /**
   * Get currently active pump/dump alerts.
   */
  getActiveAlerts(): PumpSignal[] {
    // Prune alerts older than 5 minutes
    const cutoff = Date.now() - 5 * 60 * 1000;
    this.activeAlerts = this.activeAlerts.filter((a) => a.detectedAt > cutoff);
    return [...this.activeAlerts];
  }

  /**
   * Get detection history for a specific token.
   */
  getHistory(token: string, limit = 50): PumpSignal[] {
    const tokenHistory = this.history.get(token) ?? [];
    return tokenHistory.slice(-limit);
  }

  /**
   * Reset CUSUM state for a specific token, or all tokens if none specified.
   */
  reset(token?: string): void {
    if (token) {
      this.states.delete(token);
      this.history.delete(token);
      this.activeAlerts = this.activeAlerts.filter((a) => a.token !== token);
      log.debug(`Reset state for ${token}`);
    } else {
      this.states.clear();
      this.history.clear();
      this.activeAlerts = [];
      log.debug('Reset all CUSUM state');
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getOrCreateState(
    token: string,
    price: number,
    volume: number,
    timestamp: number,
  ): TokenState {
    let state = this.states.get(token);

    if (!state) {
      state = {
        prices: [],
        volumes: [],
        cusumUp: 0,
        cusumDown: 0,
        baseline: { avgReturn: 0, avgVolume: 0 },
        lastDetectionAt: 0,
        firstSampleAt: timestamp,
      };
      this.states.set(token, state);
    }

    state.prices.push(price);
    state.volumes.push(volume);

    return state;
  }

  private updateBaseline(state: TokenState): void {
    const windowSize = Math.min(this.params.windowSize, state.prices.length);
    const recentPrices = state.prices.slice(-windowSize);
    const recentVolumes = state.volumes.slice(-windowSize);

    // Calculate average return over window
    let sumReturn = 0;
    let returnCount = 0;
    for (let i = 1; i < recentPrices.length; i++) {
      const prev = recentPrices[i - 1];
      const curr = recentPrices[i];
      if (prev !== undefined && curr !== undefined && prev > 0) {
        sumReturn += (curr - prev) / prev;
        returnCount++;
      }
    }
    state.baseline.avgReturn = returnCount > 0 ? sumReturn / returnCount : 0;

    // Calculate average volume
    let sumVolume = 0;
    for (const v of recentVolumes) {
      sumVolume += v;
    }
    state.baseline.avgVolume = recentVolumes.length > 0 ? sumVolume / recentVolumes.length : 0;
  }

  private calculatePriceChange(state: TokenState): number {
    if (state.prices.length < 2) return 0;

    const windowSize = Math.min(this.params.windowSize, state.prices.length);
    const windowStart = state.prices[state.prices.length - windowSize];
    const currentPrice = state.prices[state.prices.length - 1];

    if (windowStart === undefined || currentPrice === undefined || windowStart === 0) {
      return 0;
    }

    return ((currentPrice - windowStart) / windowStart) * 100;
  }

  private createSignal(
    token: string,
    type: 'pump' | 'dump' | 'suspicious_volume',
    cusum: number,
    threshold: number,
    priceChangePct: number,
    volumeSpike: number,
    state: TokenState,
    timestamp: number,
  ): PumpSignal {
    const severity = this.classifySeverity(cusum, threshold, priceChangePct, volumeSpike);

    return {
      token,
      type,
      severity,
      cusum,
      threshold,
      priceChangePct,
      volumeSpike,
      duration: (timestamp - state.firstSampleAt) / 1000,
      startedAt: state.firstSampleAt,
      detectedAt: timestamp,
    };
  }

  private classifySeverity(
    cusum: number,
    threshold: number,
    priceChangePct: number,
    volumeSpike: number,
  ): PumpSignal['severity'] {
    const cusumRatio = threshold > 0 ? cusum / threshold : 0;
    const absPriceChange = Math.abs(priceChangePct);

    // Critical: CUSUM > 3x threshold OR price change > 50% OR volume > 20x
    if (cusumRatio > 3 || absPriceChange > 50 || volumeSpike > 20) {
      return 'critical';
    }

    // High: CUSUM > 2x threshold OR price change > 20% OR volume > 10x
    if (cusumRatio > 2 || absPriceChange > 20 || volumeSpike > 10) {
      return 'high';
    }

    // Medium: CUSUM > 1.5x threshold OR price change > 10% OR volume > 5x
    if (cusumRatio > 1.5 || absPriceChange > 10 || volumeSpike > VOLUME_SPIKE_MULTIPLIER) {
      return 'medium';
    }

    return 'low';
  }

  private recordSignal(signal: PumpSignal): void {
    // Add to active alerts
    this.activeAlerts.push(signal);

    // Add to history
    const tokenHistory = this.history.get(signal.token) ?? [];
    tokenHistory.push(signal);

    // Keep history bounded (last 200 per token)
    if (tokenHistory.length > 200) {
      tokenHistory.splice(0, tokenHistory.length - 200);
    }

    this.history.set(signal.token, tokenHistory);
  }
}
