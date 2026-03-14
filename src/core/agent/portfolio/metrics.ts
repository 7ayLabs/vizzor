// ---------------------------------------------------------------------------
// Portfolio performance metrics
// ---------------------------------------------------------------------------

import type { TradeRecord, PortfolioState } from './types.js';

export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdown: number;
  avgHoldingPeriodMs: number;
}

export function calculateMetrics(
  trades: TradeRecord[],
  portfolio: PortfolioState,
  initialCapital: number,
): PerformanceMetrics {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);

  const totalReturn = portfolio.totalValue - initialCapital;
  const totalReturnPct = initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0;

  const avgWinPct = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0 ? losses.reduce((sum, t) => sum + Math.abs(t.pnlPct), 0) / losses.length : 0;

  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const returns = trades.map((t) => t.pnlPct / 100);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

  const variance =
    returns.length > 1
      ? returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  // Downside deviation (only negative returns)
  const negativeReturns = returns.filter((r) => r < 0);
  const downsideVariance =
    negativeReturns.length > 0
      ? negativeReturns.reduce((sum, r) => sum + r ** 2, 0) / negativeReturns.length
      : 0;
  const downsideDeviation = Math.sqrt(downsideVariance);

  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;
  const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(365) : 0;
  const calmarRatio = portfolio.maxDrawdown > 0 ? totalReturnPct / portfolio.maxDrawdown : 0;

  const avgHoldingPeriodMs =
    trades.length > 0
      ? trades.reduce((sum, t) => sum + (t.closedAt - t.openedAt), 0) / trades.length
      : 0;

  return {
    totalReturn,
    totalReturnPct,
    winRate: portfolio.winRate,
    avgWinPct,
    avgLossPct,
    profitFactor,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    maxDrawdown: portfolio.maxDrawdown,
    avgHoldingPeriodMs,
  };
}
