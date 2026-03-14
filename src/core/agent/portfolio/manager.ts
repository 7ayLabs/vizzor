// ---------------------------------------------------------------------------
// Portfolio manager — position tracking, P&L, metrics
// ---------------------------------------------------------------------------

import type { Position, PortfolioState, TradeRecord, RiskConfig } from './types.js';
import {
  calculatePositionSize,
  calculateStopLoss,
  calculateTakeProfit,
  updateTrailingStop,
  shouldClosePosition,
  canOpenPosition,
} from './risk.js';

const DEFAULT_INITIAL_CAPITAL = 10_000; // Paper trading default

export class PortfolioManager {
  private positions: Position[] = [];
  private trades: TradeRecord[] = [];
  private cash: number;
  private initialCapital: number;
  private peakValue: number;
  private riskConfig: RiskConfig;

  constructor(riskConfig: RiskConfig, initialCapital: number = DEFAULT_INITIAL_CAPITAL) {
    this.riskConfig = riskConfig;
    this.cash = initialCapital;
    this.initialCapital = initialCapital;
    this.peakValue = initialCapital;
  }

  getState(): PortfolioState {
    const positionValue = this.positions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
    const totalValue = this.cash + positionValue;
    const unrealized = this.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    // Update peak and drawdown
    if (totalValue > this.peakValue) {
      this.peakValue = totalValue;
    }
    const drawdown =
      this.peakValue > 0 ? ((this.peakValue - totalValue) / this.peakValue) * 100 : 0;

    const wins = this.trades.filter((t) => t.pnl > 0).length;
    const losses = this.trades.filter((t) => t.pnl < 0).length;
    const total = wins + losses;

    return {
      totalValue,
      cash: this.cash,
      positions: [...this.positions],
      realizedPnl: this.trades.reduce((sum, t) => sum + t.pnl, 0) + unrealized,
      maxDrawdown: drawdown,
      winRate: total > 0 ? wins / total : 0,
      sharpeRatio: this.calculateSharpe(),
      totalTrades: this.trades.length,
      winningTrades: wins,
      losingTrades: losses,
    };
  }

  openPosition(
    symbol: string,
    side: 'long' | 'short',
    currentPrice: number,
    atr?: number,
  ): Position | null {
    const state = this.getState();
    if (!canOpenPosition(this.riskConfig, state)) return null;

    const quantity = calculatePositionSize(this.riskConfig, state, currentPrice);
    if (quantity <= 0) return null;

    const cost = currentPrice * quantity;
    if (cost > this.cash) return null;

    const position: Position = {
      symbol,
      side,
      entryPrice: currentPrice,
      quantity,
      currentPrice,
      unrealizedPnl: 0,
      stopLoss: calculateStopLoss(this.riskConfig, currentPrice, side, atr),
      takeProfit: calculateTakeProfit(this.riskConfig, currentPrice, side),
      openedAt: Date.now(),
    };

    this.cash -= cost;
    this.positions.push(position);
    return position;
  }

  updatePrices(prices: Map<string, number>): TradeRecord[] {
    const closed: TradeRecord[] = [];

    for (let i = this.positions.length - 1; i >= 0; i--) {
      const pos = this.positions[i];
      const price = prices.get(pos.symbol);
      if (!price) continue;

      // Update current price and PnL
      pos.currentPrice = price;
      pos.unrealizedPnl =
        pos.side === 'long'
          ? (price - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - price) * pos.quantity;

      // Update trailing stop if configured
      if (this.riskConfig.stopLossType === 'trailing') {
        pos.stopLoss = updateTrailingStop(pos, price, this.riskConfig.stopLossPct);
      }

      // Check if should close
      const { close, reason } = shouldClosePosition(pos, price);
      if (close) {
        const trade = this.closePosition(i, price, reason);
        if (trade) closed.push(trade);
      }
    }

    return closed;
  }

  closePosition(index: number, exitPrice: number, reason: string): TradeRecord | null {
    if (index < 0 || index >= this.positions.length) return null;

    const pos = this.positions[index];
    const pnl =
      pos.side === 'long'
        ? (exitPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - exitPrice) * pos.quantity;
    const pnlPct =
      pos.side === 'long'
        ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - exitPrice) / pos.entryPrice) * 100;

    const trade: TradeRecord = {
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice,
      quantity: pos.quantity,
      pnl,
      pnlPct,
      openedAt: pos.openedAt,
      closedAt: Date.now(),
      reason,
    };

    this.cash += exitPrice * pos.quantity;
    this.trades.push(trade);
    this.positions.splice(index, 1);

    return trade;
  }

  getTradeHistory(): TradeRecord[] {
    return [...this.trades];
  }

  getInitialCapital(): number {
    return this.initialCapital;
  }

  private calculateSharpe(): number {
    if (this.trades.length < 2) return 0;

    const returns = this.trades.map((t) => t.pnlPct / 100);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualized (assuming ~365 trades/year for hourly strategies)
    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;
  }
}
