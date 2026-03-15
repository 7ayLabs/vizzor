// ---------------------------------------------------------------------------
// Backtest engine — historical strategy simulation
// ---------------------------------------------------------------------------

import type { BacktestConfig, BacktestResult, BacktestTrade, BacktestMetrics } from './types.js';
import { fetchKlines } from '../../data/sources/binance.js';
import { getStrategy } from '../agent/manager.js';
import type { AgentSignals } from '../agent/types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('backtest');

export class BacktestEngine {
  private config: BacktestConfig;

  constructor(config: BacktestConfig) {
    this.config = config;
  }

  async run(): Promise<BacktestResult> {
    log.info(
      `Backtest: ${this.config.strategy} on ${this.config.pair} (${this.config.from} → ${this.config.to})`,
    );

    const strategy = getStrategy(this.config.strategy);
    const klines = await fetchKlines(this.config.pair, this.config.timeframe, 1000);

    // Filter klines within date range
    const fromTs = new Date(this.config.from).getTime();
    const toTs = new Date(this.config.to).getTime();
    const filtered = klines.filter((k) => k.openTime >= fromTs && k.openTime <= toTs);

    if (filtered.length === 0) {
      return this.emptyResult();
    }

    const trades: BacktestTrade[] = [];
    const equityCurve: { time: number; equity: number }[] = [];
    const drawdownCurve: { time: number; drawdown: number }[] = [];

    let cash = this.config.initialCapital;
    let position: { side: 'long'; entryPrice: number; entryTime: number; size: number } | null =
      null;
    let peak = cash;

    for (const candle of filtered) {
      const price = candle.close;
      const equity = position ? cash + position.size * price : cash;

      if (equity > peak) peak = equity;
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

      equityCurve.push({ time: candle.openTime, equity });
      drawdownCurve.push({ time: candle.openTime, drawdown });

      // Build minimal signals from candle
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
        price,
      };

      const decision = strategy.evaluate(signals);

      if (decision.action === 'buy' && !position && cash > 0) {
        const size = (cash * 0.95) / price; // Use 95% of cash
        const commission = cash * 0.95 * (this.config.commissionPct / 100);
        cash -= size * price + commission;
        position = { side: 'long', entryPrice: price, entryTime: candle.openTime, size };
      } else if (decision.action === 'sell' && position) {
        const exitValue = position.size * price;
        const commission = exitValue * (this.config.commissionPct / 100);
        const pnl = exitValue - position.size * position.entryPrice - commission;
        const pnlPct = (pnl / (position.size * position.entryPrice)) * 100;

        trades.push({
          entryTime: position.entryTime,
          exitTime: candle.openTime,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice: price,
          size: position.size,
          pnl,
          pnlPct,
          reason: decision.reasoning.join('; '),
        });

        cash += exitValue - commission;
        position = null;
      }
    }

    // Close any remaining position at last price
    if (position && filtered.length > 0) {
      const lastCandle = filtered[filtered.length - 1];
      const lastPrice = lastCandle?.close ?? 0;
      const exitValue = position.size * lastPrice;
      const pnl = exitValue - position.size * position.entryPrice;
      trades.push({
        entryTime: position.entryTime,
        exitTime: lastCandle?.openTime ?? 0,
        side: position.side,
        entryPrice: position.entryPrice,
        exitPrice: lastPrice,
        size: position.size,
        pnl,
        pnlPct: (pnl / (position.size * position.entryPrice)) * 100,
        reason: 'End of backtest period',
      });
      cash += exitValue;
    }

    const metrics = this.calculateMetrics(trades, cash);

    return {
      config: this.config,
      trades,
      metrics,
      equityCurve,
      drawdownCurve,
    };
  }

  private calculateMetrics(trades: BacktestTrade[], finalCash: number): BacktestMetrics {
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);
    const totalReturn = finalCash - this.config.initialCapital;
    const totalReturnPct = (totalReturn / this.config.initialCapital) * 100;
    const winRate = trades.length > 0 ? wins.length / trades.length : 0;
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const returns = trades.map((t) => t.pnlPct / 100);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance =
      returns.length > 1
        ? returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1)
        : 0;
    const sharpeRatio =
      Math.sqrt(variance) > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(365) : 0;

    // Max drawdown from equity curve perspective
    let maxDrawdown = 0;
    let peak = this.config.initialCapital;
    let running = this.config.initialCapital;
    for (const t of trades) {
      running += t.pnl;
      if (running > peak) peak = running;
      const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const avgHoldingPeriodMs =
      trades.length > 0
        ? trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0) / trades.length
        : 0;

    return {
      totalReturn,
      totalReturnPct,
      winRate,
      totalTrades: trades.length,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      avgHoldingPeriodMs,
    };
  }

  private emptyResult(): BacktestResult {
    return {
      config: this.config,
      trades: [],
      metrics: {
        totalReturn: 0,
        totalReturnPct: 0,
        winRate: 0,
        totalTrades: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        avgHoldingPeriodMs: 0,
      },
      equityCurve: [],
      drawdownCurve: [],
    };
  }
}
