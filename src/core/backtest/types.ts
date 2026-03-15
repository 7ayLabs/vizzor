// ---------------------------------------------------------------------------
// Backtesting types
// ---------------------------------------------------------------------------

export interface BacktestConfig {
  strategy: string;
  pair: string;
  from: string; // ISO date
  to: string;
  initialCapital: number;
  timeframe: string;
  slippageBps: number;
  commissionPct: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPct: number;
  reason: string;
}

export interface BacktestMetrics {
  totalReturn: number;
  totalReturnPct: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgHoldingPeriodMs: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: { time: number; equity: number }[];
  drawdownCurve: { time: number; drawdown: number }[];
}
