import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacktestConfig } from '@/core/backtest/types.js';
import ohlcvFixture from '../../../fixtures/ohlcv-btc-1h.json';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// 1. Mock fetchKlines to return OHLCV fixture data
vi.mock('@/data/sources/binance.js', () => ({
  fetchKlines: vi.fn(async () => ohlcvFixture),
}));

// 2. Mock getDb with basic stubs (strategy manager needs it)
vi.mock('@/data/cache.js', () => ({
  getDb: () => ({
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ changes: 0 })),
      all: vi.fn(() => []),
      get: vi.fn(),
    })),
  }),
}));

// 3. Mock getMLClient returning null
vi.mock('@/ml/client.js', () => ({
  getMLClient: vi.fn(() => null),
}));

// Strategy mocks — the manager imports these to build the strategy registry.
// Momentum uses a simple price-based rule so the engine generates trades.
vi.mock('@/core/agent/strategies/momentum.js', () => ({
  momentumStrategy: {
    name: 'momentum',
    description: 'RSI reversal + MACD confirmation (test mock)',
    evaluate: vi.fn((signals: { price: number | null }) => {
      const price = signals.price ?? 42000;
      if (price < 42200)
        return {
          action: 'buy' as const,
          confidence: 70,
          reasoning: ['price below 42200 — buy signal'],
        };
      if (price > 43500)
        return {
          action: 'sell' as const,
          confidence: 70,
          reasoning: ['price above 43500 — sell signal'],
        };
      return { action: 'hold' as const, confidence: 50, reasoning: ['price neutral'] };
    }),
  },
}));

vi.mock('@/core/agent/strategies/trend-following.js', () => ({
  trendFollowingStrategy: {
    name: 'trend-following',
    description: 'test stub',
    evaluate: vi.fn(() => ({ action: 'hold', confidence: 50, reasoning: ['neutral'] })),
  },
}));

vi.mock('@/core/agent/strategies/ml-adaptive.js', () => ({
  mlAdaptiveStrategy: {
    name: 'ml-adaptive',
    description: 'test stub',
    evaluate: vi.fn(() => ({ action: 'hold', confidence: 50, reasoning: ['neutral'] })),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { BacktestEngine } from '@/core/backtest/engine.js';

// ---------------------------------------------------------------------------
// Shared config
// ---------------------------------------------------------------------------

const config: BacktestConfig = {
  strategy: 'momentum',
  pair: 'BTCUSDT',
  from: '2024-01-01',
  to: '2024-12-31',
  initialCapital: 10000,
  timeframe: '1h',
  slippageBps: 10,
  commissionPct: 0.1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BacktestEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when no klines match date range', async () => {
    const outOfRange: BacktestConfig = {
      ...config,
      from: '2020-01-01',
      to: '2020-06-01',
    };
    const engine = new BacktestEngine(outOfRange);
    const result = await engine.run();

    expect(result.trades).toEqual([]);
    expect(result.equityCurve).toEqual([]);
    expect(result.drawdownCurve).toEqual([]);
    expect(result.metrics.totalTrades).toBe(0);
    expect(result.metrics.totalReturn).toBe(0);
    expect(result.metrics.winRate).toBe(0);
  });

  it('runs backtest with fixture data and produces trades', async () => {
    const engine = new BacktestEngine(config);
    const result = await engine.run();

    expect(result.trades.length).toBeGreaterThan(0);
    for (const trade of result.trades) {
      expect(trade.entryPrice).toBeGreaterThan(0);
      expect(trade.exitPrice).toBeGreaterThan(0);
      expect(trade.size).toBeGreaterThan(0);
      expect(trade.exitTime).toBeGreaterThanOrEqual(trade.entryTime);
      expect(trade.side).toBe('long');
      expect(trade.reason).toBeTruthy();
    }
  });

  it('calculates correct metrics (winRate between 0-1, totalTrades > 0)', async () => {
    const engine = new BacktestEngine(config);
    const result = await engine.run();

    expect(result.metrics.totalTrades).toBeGreaterThan(0);
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.winRate).toBeLessThanOrEqual(1);
    expect(typeof result.metrics.totalReturn).toBe('number');
    expect(typeof result.metrics.totalReturnPct).toBe('number');
    expect(typeof result.metrics.profitFactor).toBe('number');
    expect(typeof result.metrics.sharpeRatio).toBe('number');
    expect(result.metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.metrics.avgHoldingPeriodMs).toBeGreaterThanOrEqual(0);
  });

  it('equity curve has same length as filtered candles', async () => {
    const engine = new BacktestEngine(config);
    const result = await engine.run();

    // All fixture candles fall within 2024-01-01 to 2024-12-31
    const fromTs = new Date(config.from).getTime();
    const toTs = new Date(config.to).getTime();
    const expectedLength = ohlcvFixture.filter(
      (k) => k.openTime >= fromTs && k.openTime <= toTs,
    ).length;

    expect(result.equityCurve).toHaveLength(expectedLength);
    expect(result.drawdownCurve).toHaveLength(expectedLength);
  });

  it('commission reduces returns', async () => {
    const noCommission: BacktestConfig = { ...config, commissionPct: 0 };
    const highCommission: BacktestConfig = { ...config, commissionPct: 1 };

    const resultNoComm = await new BacktestEngine(noCommission).run();
    const resultHighComm = await new BacktestEngine(highCommission).run();

    // Both runs should produce trades
    expect(resultNoComm.metrics.totalTrades).toBeGreaterThan(0);
    expect(resultHighComm.metrics.totalTrades).toBeGreaterThan(0);

    // Higher commission must yield lower or equal total return
    expect(resultHighComm.metrics.totalReturn).toBeLessThanOrEqual(
      resultNoComm.metrics.totalReturn,
    );
  });

  it('initial capital is preserved in config', async () => {
    const engine = new BacktestEngine(config);
    const result = await engine.run();

    expect(result.config.initialCapital).toBe(10000);
    expect(result.config).toEqual(config);
  });
});
