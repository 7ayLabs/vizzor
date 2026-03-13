// ---------------------------------------------------------------------------
// Agent engine — think → analyze → decide → act cycle
// ---------------------------------------------------------------------------

import type {
  AgentConfig,
  AgentStrategy,
  AgentSignals,
  AgentCycleResult,
  AgentState,
} from './types.js';
import { fetchTickerPrice, fetchFundingRate } from '../../data/sources/binance.js';
import { fetchFearGreedIndex } from '../../data/sources/fear-greed.js';
import { getStrategy } from './manager.js';
import { logDecision } from './manager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('agent-engine');

export class AgentEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: AgentState;
  private strategy: AgentStrategy;

  constructor(config: AgentConfig) {
    this.strategy = getStrategy(config.strategy);
    this.state = {
      config,
      status: 'idle',
      lastCycle: null,
      cycleCount: 0,
      error: null,
    };
  }

  getState(): AgentState {
    return { ...this.state };
  }

  start(): void {
    if (this.state.status === 'running') return;

    this.state.status = 'running';
    this.state.error = null;
    logger.info(`Agent ${this.state.config.name} started (${this.strategy.name})`);

    // Run immediately, then at interval
    void this.runCycle();
    this.timer = setInterval(() => {
      void this.runCycle();
    }, this.state.config.interval * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.status = 'stopped';
    logger.info(`Agent ${this.state.config.name} stopped`);
  }

  private async runCycle(): Promise<void> {
    for (const symbol of this.state.config.pairs) {
      try {
        const signals = await this.gatherSignals(symbol);
        const decision = this.strategy.evaluate(signals);

        const result: AgentCycleResult = {
          agentId: this.state.config.id,
          symbol,
          timestamp: Date.now(),
          signals,
          decision,
        };

        this.state.lastCycle = result;
        this.state.cycleCount++;

        // Log to DB
        logDecision(result);

        if (decision.action !== 'hold') {
          logger.info(
            `Agent ${this.state.config.name} → ${decision.action.toUpperCase()} ${symbol} (confidence: ${decision.confidence}%)`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.state.error = `Cycle error for ${symbol}: ${message}`;
        logger.warn(`Agent ${this.state.config.name} cycle error: ${message}`);
      }
    }
  }

  /**
   * Gather all signals for a symbol. Uses Promise.allSettled so partial
   * failures don't block the entire cycle.
   */
  private async gatherSignals(symbol: string): Promise<AgentSignals> {
    const signals: AgentSignals = {
      rsi: null,
      macdHistogram: null,
      ema12: null,
      ema26: null,
      bollingerPercentB: null,
      atr: null,
      obv: null,
      fundingRate: null,
      fearGreed: null,
      priceChange24h: null,
      price: null,
    };

    const [priceResult, fundingResult, fgResult] = await Promise.allSettled([
      fetchTickerPrice(symbol),
      fetchFundingRate(symbol),
      fetchFearGreedIndex(1),
    ]);

    if (priceResult.status === 'fulfilled') {
      signals.price = priceResult.value.price;
      signals.priceChange24h = priceResult.value.change24h;
    }

    if (fundingResult.status === 'fulfilled') {
      signals.fundingRate = fundingResult.value.fundingRate;
    }

    if (fgResult.status === 'fulfilled') {
      signals.fearGreed = fgResult.value.current.value;
    }

    // Technical analysis signals are gathered lazily via the manager
    // when the TA module is available (requires kline data).
    // For v0.3.0, the engine uses price + derivatives + macro signals.
    // Full TA integration happens in the agent cycle via direct indicator calls.

    return signals;
  }
}
