// ---------------------------------------------------------------------------
// Portfolio management types
// ---------------------------------------------------------------------------

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  unrealizedPnl: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
}

export interface PortfolioState {
  totalValue: number;
  cash: number;
  positions: Position[];
  realizedPnl: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

export interface TradeRecord {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  openedAt: number;
  closedAt: number;
  reason: string;
}

export interface RiskConfig {
  maxPositionSizePct: number; // max % of portfolio per position
  maxOpenPositions: number;
  maxDrawdownPct: number; // kill switch threshold
  stopLossType: 'fixed' | 'trailing' | 'atr-based';
  stopLossPct: number;
  takeProfitPct: number;
  positionSizing: 'fixed' | 'kelly';
}
