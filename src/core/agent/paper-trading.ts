// ---------------------------------------------------------------------------
// Paper trading engine — realistic simulation with slippage, fees, fills
// ---------------------------------------------------------------------------

import type { PortfolioState, Position, TradeRecord } from './portfolio/types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('paper-trading');

// Slippage model by market cap tier
const SLIPPAGE_MODEL = {
  top50: { min: 0.0001, max: 0.0005 },
  midCap: { min: 0.001, max: 0.005 },
  smallCap: { min: 0.005, max: 0.02 },
} as const;

const DEX_FEE_PCT = 0.003; // 0.3% DEX fee
const EST_GAS_USD = 5; // estimated gas in USD

export type MarketCapTier = 'top50' | 'midCap' | 'smallCap';

export class PaperTradingEngine {
  private cash: number;
  private readonly _initialCapital: number;
  private positions: Position[] = [];
  private trades: TradeRecord[] = [];
  private peakValue: number;

  constructor(initialCash: number) {
    this.cash = initialCash;
    this._initialCapital = initialCash;
    this.peakValue = initialCash;
    log.info(`Paper trading engine initialized with $${initialCash}`);
  }

  getPortfolio(): PortfolioState {
    const positionValue = this.positions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
    const totalValue = this.cash + positionValue;

    if (totalValue > this.peakValue) {
      this.peakValue = totalValue;
    }

    const drawdown =
      this.peakValue > 0 ? ((this.peakValue - totalValue) / this.peakValue) * 100 : 0;

    const wins = this.trades.filter((t) => t.pnl > 0).length;
    const losses = this.trades.filter((t) => t.pnl < 0).length;
    const total = wins + losses;

    const realizedPnl = this.trades.reduce((sum, t) => sum + t.pnl, 0);

    return {
      totalValue,
      cash: this.cash,
      positions: [...this.positions],
      realizedPnl,
      totalReturnPct:
        this._initialCapital > 0
          ? ((totalValue - this._initialCapital) / this._initialCapital) * 100
          : 0,
      maxDrawdown: drawdown,
      winRate: total > 0 ? wins / total : 0,
      sharpeRatio: this.calculateSharpe(),
      totalTrades: this.trades.length,
      winningTrades: wins,
      losingTrades: losses,
    };
  }

  simulateBuy(
    symbol: string,
    amountUsd: number,
    currentPrice: number,
    tier: MarketCapTier = 'midCap',
  ): TradeRecord {
    const slippage = this.calculateSlippage(tier);
    const fillPrice = currentPrice * (1 + slippage);
    const dexFee = amountUsd * DEX_FEE_PCT;
    const totalCost = amountUsd + dexFee + EST_GAS_USD;

    if (totalCost > this.cash) {
      throw new Error(
        `Insufficient funds: need $${totalCost.toFixed(2)} but only have $${this.cash.toFixed(2)}`,
      );
    }

    const quantity = amountUsd / fillPrice;

    // Deduct total cost (principal + fees + gas)
    this.cash -= totalCost;

    // Create position
    const position: Position = {
      symbol,
      side: 'long',
      entryPrice: fillPrice,
      quantity,
      currentPrice: fillPrice,
      unrealizedPnl: 0,
      stopLoss: 0,
      takeProfit: 0,
      openedAt: Date.now(),
    };

    this.positions.push(position);

    const record: TradeRecord = {
      symbol,
      side: 'long',
      entryPrice: fillPrice,
      exitPrice: 0,
      quantity,
      pnl: -(dexFee + EST_GAS_USD), // initial cost of fees
      pnlPct: -((dexFee + EST_GAS_USD) / amountUsd) * 100,
      openedAt: Date.now(),
      closedAt: 0,
      reason: `paper-buy: slippage=${(slippage * 100).toFixed(4)}% fee=$${dexFee.toFixed(2)} gas=$${EST_GAS_USD}`,
    };

    log.info(
      `[PAPER] BUY ${quantity.toFixed(6)} ${symbol} @ $${fillPrice.toFixed(4)} ` +
        `(slippage: ${(slippage * 100).toFixed(4)}%, fee: $${dexFee.toFixed(2)}, gas: $${EST_GAS_USD})`,
    );

    return record;
  }

  simulateSell(
    symbol: string,
    quantity: number,
    currentPrice: number,
    tier: MarketCapTier = 'midCap',
  ): TradeRecord {
    // Find matching position
    const posIndex = this.positions.findIndex((p) => p.symbol === symbol && p.quantity >= quantity);

    if (posIndex === -1) {
      throw new Error(`No position found for ${symbol} with sufficient quantity (${quantity})`);
    }

    const position = this.positions[posIndex];

    const slippage = this.calculateSlippage(tier);
    const fillPrice = currentPrice * (1 - slippage);
    const proceeds = fillPrice * quantity;
    const dexFee = proceeds * DEX_FEE_PCT;
    const netProceeds = proceeds - dexFee - EST_GAS_USD;

    // Calculate P&L
    const costBasis = position.entryPrice * quantity;
    const pnl = netProceeds - costBasis;
    const pnlPct = (pnl / costBasis) * 100;

    // Add proceeds to cash
    this.cash += netProceeds;

    // Close or reduce position
    if (quantity >= position.quantity) {
      this.positions.splice(posIndex, 1);
    } else {
      position.quantity -= quantity;
    }

    const record: TradeRecord = {
      symbol,
      side: 'long',
      entryPrice: position.entryPrice,
      exitPrice: fillPrice,
      quantity,
      pnl,
      pnlPct,
      openedAt: position.openedAt,
      closedAt: Date.now(),
      reason: `paper-sell: slippage=${(slippage * 100).toFixed(4)}% fee=$${dexFee.toFixed(2)} gas=$${EST_GAS_USD}`,
    };

    this.trades.push(record);

    log.info(
      `[PAPER] SELL ${quantity.toFixed(6)} ${symbol} @ $${fillPrice.toFixed(4)} ` +
        `(P&L: $${pnl.toFixed(2)} / ${pnlPct.toFixed(2)}%)`,
    );

    return record;
  }

  updatePrices(prices: Record<string, number>): void {
    for (const position of this.positions) {
      const price = prices[position.symbol];
      if (price === undefined) continue;

      position.currentPrice = price;
      position.unrealizedPnl =
        position.side === 'long'
          ? (price - position.entryPrice) * position.quantity
          : (position.entryPrice - price) * position.quantity;
    }
  }

  getPerformance(): {
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalPnl: number;
    totalTrades: number;
  } {
    const portfolio = this.getPortfolio();
    return {
      winRate: portfolio.winRate,
      sharpeRatio: portfolio.sharpeRatio,
      maxDrawdown: portfolio.maxDrawdown,
      totalPnl: portfolio.realizedPnl,
      totalTrades: portfolio.totalTrades,
    };
  }

  private calculateSlippage(tier: MarketCapTier): number {
    const model = SLIPPAGE_MODEL[tier];
    return model.min + Math.random() * (model.max - model.min);
  }

  private calculateSharpe(): number {
    if (this.trades.length < 2) return 0;

    const returns = this.trades.map((t) => t.pnlPct / 100);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualized (assuming ~365 trades/year)
    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;
  }
}
