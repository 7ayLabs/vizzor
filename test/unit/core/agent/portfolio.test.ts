import { describe, it, expect, vi } from 'vitest';

// Mock ML client to prevent real network calls
vi.mock('@/ml/client.js', () => ({
  getMLClient: () => null,
}));

import {
  calculatePositionSize,
  calculateStopLoss,
  calculateTakeProfit,
  shouldClosePosition,
  canOpenPosition,
  updateTrailingStop,
  shouldTriggerKillSwitch,
} from '@/core/agent/portfolio/risk.js';
import type { RiskConfig, PortfolioState, Position } from '@/core/agent/portfolio/types.js';

const defaultRisk: RiskConfig = {
  maxPositionSizePct: 10,
  stopLossPct: 5,
  takeProfitPct: 10,
  maxDrawdownPct: 20,
  maxOpenPositions: 3,
  positionSizing: 'fixed',
  stopLossType: 'fixed',
};

const defaultPortfolio: PortfolioState = {
  cash: 10000,
  totalValue: 10000,
  positions: [],
  realizedPnl: 0,
  winRate: 0.5,
  winningTrades: 5,
  losingTrades: 5,
  maxDrawdown: 5,
  sharpeRatio: 1.0,
  totalTrades: 10,
};

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    symbol: 'BTC',
    side: 'long',
    entryPrice: 100,
    quantity: 1,
    currentPrice: 100,
    unrealizedPnl: 0,
    stopLoss: 95,
    takeProfit: 110,
    openedAt: Date.now(),
    ...overrides,
  };
}

describe('Portfolio Risk', () => {
  describe('calculatePositionSize', () => {
    it('calculates fixed position size', () => {
      const size = calculatePositionSize(defaultRisk, defaultPortfolio, 100);
      // 10% of 10000 = 1000 / 100 = 10
      expect(size).toBe(10);
    });

    it('scales with portfolio value', () => {
      const largerPortfolio = { ...defaultPortfolio, totalValue: 50000 };
      const size = calculatePositionSize(defaultRisk, largerPortfolio, 100);
      // 10% of 50000 = 5000 / 100 = 50
      expect(size).toBe(50);
    });

    it('scales inversely with price', () => {
      const size = calculatePositionSize(defaultRisk, defaultPortfolio, 200);
      // 10% of 10000 = 1000 / 200 = 5
      expect(size).toBe(5);
    });

    it('uses kelly criterion when configured', () => {
      const kellyRisk: RiskConfig = { ...defaultRisk, positionSizing: 'kelly' };
      const size = calculatePositionSize(kellyRisk, defaultPortfolio, 100);
      // Kelly produces a value based on win rate and payoff ratio
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateStopLoss', () => {
    it('calculates stop-loss for long position', () => {
      const sl = calculateStopLoss(defaultRisk, 100, 'long');
      expect(sl).toBe(95); // 100 - 5%
    });

    it('calculates stop-loss for short position', () => {
      const sl = calculateStopLoss(defaultRisk, 100, 'short');
      expect(sl).toBe(105); // 100 + 5%
    });

    it('uses ATR-based stop when configured and ATR provided', () => {
      const atrRisk: RiskConfig = { ...defaultRisk, stopLossType: 'atr-based' };
      const sl = calculateStopLoss(atrRisk, 100, 'long', 5);
      // ATR multiplier is 2, so 100 - (5 * 2) = 90
      expect(sl).toBe(90);
    });

    it('falls back to fixed when ATR-based but no ATR provided', () => {
      const atrRisk: RiskConfig = { ...defaultRisk, stopLossType: 'atr-based' };
      const sl = calculateStopLoss(atrRisk, 100, 'long');
      expect(sl).toBe(95); // fixed fallback
    });
  });

  describe('calculateTakeProfit', () => {
    it('calculates take-profit for long position', () => {
      const tp = calculateTakeProfit(defaultRisk, 100, 'long');
      expect(tp).toBe(110); // 100 + 10%
    });

    it('calculates take-profit for short position', () => {
      const tp = calculateTakeProfit(defaultRisk, 100, 'short');
      expect(tp).toBe(90); // 100 - 10%
    });
  });

  describe('shouldClosePosition', () => {
    it('triggers stop-loss for long when price drops below stop', () => {
      const position = makePosition({ side: 'long', stopLoss: 95, takeProfit: 110 });
      const result = shouldClosePosition(position, 94);
      expect(result.close).toBe(true);
      expect(result.reason).toBe('stop-loss');
    });

    it('triggers take-profit for long when price rises above target', () => {
      const position = makePosition({ side: 'long', stopLoss: 95, takeProfit: 110 });
      const result = shouldClosePosition(position, 111);
      expect(result.close).toBe(true);
      expect(result.reason).toBe('take-profit');
    });

    it('does not close when price is between stop and target for long', () => {
      const position = makePosition({ side: 'long', stopLoss: 95, takeProfit: 110 });
      const result = shouldClosePosition(position, 100);
      expect(result.close).toBe(false);
    });

    it('triggers stop-loss for short when price rises above stop', () => {
      const position = makePosition({ side: 'short', stopLoss: 105, takeProfit: 90 });
      const result = shouldClosePosition(position, 106);
      expect(result.close).toBe(true);
      expect(result.reason).toBe('stop-loss');
    });

    it('triggers take-profit for short when price drops below target', () => {
      const position = makePosition({ side: 'short', stopLoss: 105, takeProfit: 90 });
      const result = shouldClosePosition(position, 89);
      expect(result.close).toBe(true);
      expect(result.reason).toBe('take-profit');
    });

    it('does not close when price is between stop and target for short', () => {
      const position = makePosition({ side: 'short', stopLoss: 105, takeProfit: 90 });
      const result = shouldClosePosition(position, 98);
      expect(result.close).toBe(false);
    });
  });

  describe('canOpenPosition', () => {
    it('allows opening when under max positions', () => {
      expect(canOpenPosition(defaultRisk, defaultPortfolio)).toBe(true);
    });

    it('rejects when at max positions', () => {
      const full: PortfolioState = {
        ...defaultPortfolio,
        positions: [makePosition(), makePosition(), makePosition()],
      };
      expect(canOpenPosition(defaultRisk, full)).toBe(false);
    });

    it('rejects when drawdown exceeds kill switch', () => {
      const drawdown: PortfolioState = {
        ...defaultPortfolio,
        maxDrawdown: 25, // exceeds 20%
      };
      expect(canOpenPosition(defaultRisk, drawdown)).toBe(false);
    });

    it('rejects when no cash available', () => {
      const noCash: PortfolioState = {
        ...defaultPortfolio,
        cash: 0,
      };
      expect(canOpenPosition(defaultRisk, noCash)).toBe(false);
    });
  });

  describe('updateTrailingStop', () => {
    it('moves stop up for long when price rises', () => {
      const position = makePosition({ side: 'long', stopLoss: 95 });
      const newStop = updateTrailingStop(position, 120, 5);
      // 120 * (1 - 0.05) = 114 > 95
      expect(newStop).toBe(114);
    });

    it('does not lower stop for long when price drops', () => {
      const position = makePosition({ side: 'long', stopLoss: 95 });
      const newStop = updateTrailingStop(position, 90, 5);
      // 90 * 0.95 = 85.5 < 95, so keeps 95
      expect(newStop).toBe(95);
    });

    it('moves stop down for short when price drops', () => {
      const position = makePosition({ side: 'short', stopLoss: 105 });
      const newStop = updateTrailingStop(position, 80, 5);
      // 80 * (1 + 0.05) = 84 < 105
      expect(newStop).toBe(84);
    });

    it('does not raise stop for short when price rises', () => {
      const position = makePosition({ side: 'short', stopLoss: 105 });
      const newStop = updateTrailingStop(position, 110, 5);
      // 110 * 1.05 = 115.5 > 105, so keeps 105
      expect(newStop).toBe(105);
    });
  });

  describe('shouldTriggerKillSwitch', () => {
    it('returns false when drawdown is below threshold', () => {
      expect(shouldTriggerKillSwitch(defaultRisk, defaultPortfolio)).toBe(false);
    });

    it('returns true when drawdown meets threshold', () => {
      const dd: PortfolioState = { ...defaultPortfolio, maxDrawdown: 20 };
      expect(shouldTriggerKillSwitch(defaultRisk, dd)).toBe(true);
    });

    it('returns true when drawdown exceeds threshold', () => {
      const dd: PortfolioState = { ...defaultPortfolio, maxDrawdown: 30 };
      expect(shouldTriggerKillSwitch(defaultRisk, dd)).toBe(true);
    });
  });
});
