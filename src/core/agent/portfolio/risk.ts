// ---------------------------------------------------------------------------
// Risk management system — stop-loss, position sizing, drawdown control
// ---------------------------------------------------------------------------

import type { RiskConfig, PortfolioState, Position } from './types.js';
import { getMLClient } from '../../../ml/client.js';

export function calculatePositionSize(
  config: RiskConfig,
  portfolio: PortfolioState,
  price: number,
): number {
  const maxAllocation = portfolio.totalValue * (config.maxPositionSizePct / 100);

  if (config.positionSizing === 'kelly') {
    // Simplified Kelly criterion
    const winRate = portfolio.winRate || 0.5;
    const avgWin =
      portfolio.winningTrades > 0
        ? portfolio.realizedPnl / Math.max(1, portfolio.winningTrades)
        : price * (config.takeProfitPct / 100);
    const avgLoss =
      portfolio.losingTrades > 0
        ? Math.abs(portfolio.realizedPnl) / Math.max(1, portfolio.losingTrades)
        : price * (config.stopLossPct / 100);
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1;
    const kelly = winRate - (1 - winRate) / Math.max(0.1, winLossRatio);
    const kellyAllocation = Math.max(0, Math.min(0.25, kelly)) * portfolio.totalValue;
    return Math.min(kellyAllocation, maxAllocation) / price;
  }

  // Fixed percentage
  return maxAllocation / price;
}

/**
 * ML-enhanced position sizing using portfolio optimizer.
 * Falls back to Kelly/fixed sizing.
 */
export async function calculatePositionSizeML(
  config: RiskConfig,
  portfolio: PortfolioState,
  price: number,
  regime = 'ranging',
  atrPct = 3,
): Promise<{ size: number; reasoning: string[] }> {
  const mlClient = getMLClient();
  if (mlClient) {
    try {
      const avgWin =
        portfolio.winningTrades > 0
          ? portfolio.realizedPnl / Math.max(1, portfolio.winningTrades)
          : price * (config.takeProfitPct / 100);
      const avgLoss =
        portfolio.losingTrades > 0
          ? Math.abs(portfolio.realizedPnl) / Math.max(1, portfolio.losingTrades)
          : price * (config.stopLossPct / 100);

      const result = await mlClient.optimizePortfolio({
        total_value: portfolio.totalValue,
        cash: portfolio.cash,
        win_rate: portfolio.winRate || 0.5,
        max_drawdown: portfolio.maxDrawdown,
        avg_win: avgWin,
        avg_loss: avgLoss,
        regime,
        atr_pct: atrPct,
      });

      if (result) {
        const allocationPct = Math.min(result.position_size_pct, result.max_allocation_pct);
        const allocation = portfolio.totalValue * (allocationPct / 100);
        return {
          size: allocation / price,
          reasoning: result.reasoning,
        };
      }
    } catch {
      // ML unavailable
    }
  }

  return {
    size: calculatePositionSize(config, portfolio, price),
    reasoning: ['Using rule-based position sizing'],
  };
}

export function calculateStopLoss(
  config: RiskConfig,
  entryPrice: number,
  side: 'long' | 'short',
  atr?: number,
): number {
  if (config.stopLossType === 'atr-based' && atr) {
    const atrMultiplier = 2;
    return side === 'long' ? entryPrice - atr * atrMultiplier : entryPrice + atr * atrMultiplier;
  }

  // Fixed or trailing (initial level is the same)
  const offset = entryPrice * (config.stopLossPct / 100);
  return side === 'long' ? entryPrice - offset : entryPrice + offset;
}

/**
 * ML-enhanced stop-loss using portfolio optimizer's stop_loss_multiplier.
 * Falls back to fixed ATR multiplier (2.0).
 */
export async function calculateStopLossML(
  config: RiskConfig,
  entryPrice: number,
  side: 'long' | 'short',
  atr: number | undefined,
  portfolio: PortfolioState,
  regime = 'ranging',
): Promise<number> {
  if (!atr) return calculateStopLoss(config, entryPrice, side, atr);

  const mlClient = getMLClient();
  if (mlClient) {
    try {
      const result = await mlClient.optimizePortfolio({
        total_value: portfolio.totalValue,
        cash: portfolio.cash,
        win_rate: portfolio.winRate || 0.5,
        max_drawdown: portfolio.maxDrawdown,
        avg_win: 0.05,
        avg_loss: 0.03,
        regime,
        atr_pct: entryPrice > 0 ? (atr / entryPrice) * 100 : 3,
      });

      if (result) {
        const multiplier = result.stop_loss_multiplier;
        return side === 'long' ? entryPrice - atr * multiplier : entryPrice + atr * multiplier;
      }
    } catch {
      // ML unavailable
    }
  }

  return calculateStopLoss(config, entryPrice, side, atr);
}

export function calculateTakeProfit(
  config: RiskConfig,
  entryPrice: number,
  side: 'long' | 'short',
): number {
  const offset = entryPrice * (config.takeProfitPct / 100);
  return side === 'long' ? entryPrice + offset : entryPrice - offset;
}

export function updateTrailingStop(
  position: Position,
  currentPrice: number,
  trailPct: number,
): number {
  if (position.side === 'long') {
    const newStop = currentPrice * (1 - trailPct / 100);
    return Math.max(position.stopLoss, newStop);
  }
  const newStop = currentPrice * (1 + trailPct / 100);
  return Math.min(position.stopLoss, newStop);
}

export function shouldTriggerKillSwitch(config: RiskConfig, portfolio: PortfolioState): boolean {
  return portfolio.maxDrawdown >= config.maxDrawdownPct;
}

export function canOpenPosition(config: RiskConfig, portfolio: PortfolioState): boolean {
  if (portfolio.positions.length >= config.maxOpenPositions) return false;
  if (shouldTriggerKillSwitch(config, portfolio)) return false;
  if (portfolio.cash <= 0) return false;
  return true;
}

export function shouldClosePosition(
  position: Position,
  currentPrice: number,
): { close: boolean; reason: string } {
  if (position.side === 'long') {
    if (currentPrice <= position.stopLoss) {
      return { close: true, reason: 'stop-loss' };
    }
    if (currentPrice >= position.takeProfit) {
      return { close: true, reason: 'take-profit' };
    }
  } else {
    if (currentPrice >= position.stopLoss) {
      return { close: true, reason: 'stop-loss' };
    }
    if (currentPrice <= position.takeProfit) {
      return { close: true, reason: 'take-profit' };
    }
  }
  return { close: false, reason: '' };
}
