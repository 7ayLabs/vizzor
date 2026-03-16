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
import type { PortfolioState } from './portfolio/types.js';
import { fetchTickerPrice, fetchFundingRate } from '../../data/sources/binance.js';
import { fetchFearGreedIndex } from '../../data/sources/fear-greed.js';
import { getStrategy } from './manager.js';
import { logDecision } from './manager.js';
import { PaperTradingEngine } from './paper-trading.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('agent-engine');

const DEFAULT_PAPER_CAPITAL = 10_000;

export class AgentEngine {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private state: AgentState;
  private strategy: AgentStrategy;
  private paperEngine: PaperTradingEngine | null = null;

  constructor(config: AgentConfig) {
    this.strategy = getStrategy(config.strategy);
    // Enforce minimum 30s interval to prevent API abuse
    const interval = Math.max(30, config.interval);
    this.state = {
      config: { ...config, interval },
      status: 'idle',
      lastCycle: null,
      cycleCount: 0,
      error: null,
    };

    // Initialize paper trading engine if mode is 'paper'
    if (config.mode === 'paper') {
      this.paperEngine = new PaperTradingEngine(DEFAULT_PAPER_CAPITAL);
      logger.info(`Agent ${config.name} running in PAPER mode`);
    }
  }

  getState(): AgentState {
    return { ...this.state };
  }

  start(): void {
    if (this.state.status === 'running') return;

    this.state.status = 'running';
    this.state.error = null;
    this.running = true;
    logger.info(`Agent ${this.state.config.name} started (${this.strategy.name})`);

    // Use setTimeout chain to prevent overlapping cycles
    void this.scheduleNextCycle(true);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.status = 'stopped';
    logger.info(`Agent ${this.state.config.name} stopped`);
  }

  private async scheduleNextCycle(immediate = false): Promise<void> {
    if (!this.running) return;

    if (!immediate) {
      await new Promise<void>((resolve) => {
        this.timer = setTimeout(resolve, this.state.config.interval * 1000);
      });
    }

    if (!this.running) return;
    await this.runCycle();

    // Schedule next only after current finishes (no overlap)
    void this.scheduleNextCycle(false);
  }

  private async runCycle(): Promise<void> {
    for (const symbol of this.state.config.pairs) {
      try {
        const signals = await this.gatherSignals(symbol);
        const decision = this.strategy.evaluateAsync
          ? await this.strategy.evaluateAsync(signals, symbol)
          : this.strategy.evaluate(signals);

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

          // Execute trade based on mode
          if (this.paperEngine && this.state.config.mode === 'paper') {
            this.executePaperTrade(symbol, decision.action, signals.price);
          }
          // Live mode execution is handled by TradeExecutor externally
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.state.error = `Cycle error for ${symbol}: ${message}`;
        logger.warn(`Agent ${this.state.config.name} cycle error: ${message}`);
      }
    }
  }

  /**
   * Returns the paper trading portfolio state, or null if not in paper mode.
   */
  getPaperPortfolio(): PortfolioState | null {
    return this.paperEngine?.getPortfolio() ?? null;
  }

  /**
   * Execute a paper trade based on the agent decision.
   */
  private executePaperTrade(symbol: string, action: 'buy' | 'sell', price: number | null): void {
    if (!this.paperEngine || !price) return;

    try {
      if (action === 'buy') {
        // Use 10% of available cash per trade
        const portfolio = this.paperEngine.getPortfolio();
        const tradeAmount = portfolio.cash * 0.1;
        if (tradeAmount > 0) {
          this.paperEngine.simulateBuy(symbol, tradeAmount, price);
        }
      } else if (action === 'sell') {
        // Sell entire position
        const portfolio = this.paperEngine.getPortfolio();
        const position = portfolio.positions.find((p) => p.symbol === symbol);
        if (position) {
          this.paperEngine.simulateSell(symbol, position.quantity, price);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Paper trade failed for ${symbol}: ${message}`);
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
      predictionMarketSentiment: null,
      predictionMarketOdds: null,
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
