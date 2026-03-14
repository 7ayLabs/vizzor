import { describe, it, expect } from 'vitest';
import { momentumStrategy } from '@/core/agent/strategies/momentum.js';
import { trendFollowingStrategy } from '@/core/agent/strategies/trend-following.js';
import type { AgentSignals } from '@/core/agent/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignals(overrides: Partial<AgentSignals> = {}): AgentSignals {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Momentum strategy
// ---------------------------------------------------------------------------

describe('momentumStrategy', () => {
  it('has name and description', () => {
    expect(momentumStrategy.name).toBe('momentum');
    expect(momentumStrategy.description).toBeTruthy();
  });

  it('returns buy on oversold RSI + bullish MACD', () => {
    const decision = momentumStrategy.evaluate(makeSignals({ rsi: 25, macdHistogram: 0.005 }));
    expect(decision.action).toBe('buy');
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.reasoning.length).toBeGreaterThan(0);
  });

  it('returns sell on overbought RSI + bearish MACD', () => {
    const decision = momentumStrategy.evaluate(makeSignals({ rsi: 75, macdHistogram: -0.005 }));
    expect(decision.action).toBe('sell');
  });

  it('returns hold on neutral signals', () => {
    const decision = momentumStrategy.evaluate(makeSignals({ rsi: 50, macdHistogram: 0.0001 }));
    expect(decision.action).toBe('hold');
  });

  it('factors in Bollinger %B extremes', () => {
    const buySignal = momentumStrategy.evaluate(
      makeSignals({ rsi: 28, macdHistogram: 0.003, bollingerPercentB: 0.05 }),
    );
    const noExtremeSignal = momentumStrategy.evaluate(
      makeSignals({ rsi: 28, macdHistogram: 0.003, bollingerPercentB: 0.5 }),
    );
    expect(buySignal.confidence).toBeGreaterThanOrEqual(noExtremeSignal.confidence);
  });

  it('factors in negative funding rate as bullish', () => {
    const withFunding = momentumStrategy.evaluate(
      makeSignals({ rsi: 32, macdHistogram: 0.002, fundingRate: -0.0005 }),
    );
    expect(withFunding.reasoning.some((r) => r.includes('capitulation'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trend-following strategy
// ---------------------------------------------------------------------------

describe('trendFollowingStrategy', () => {
  it('has name and description', () => {
    expect(trendFollowingStrategy.name).toBe('trend-following');
    expect(trendFollowingStrategy.description).toBeTruthy();
  });

  it('returns buy on golden cross (EMA12 > EMA26)', () => {
    const decision = trendFollowingStrategy.evaluate(
      makeSignals({ ema12: 110, ema26: 100, obv: 5000 }),
    );
    expect(decision.action).toBe('buy');
  });

  it('returns sell on death cross (EMA12 < EMA26)', () => {
    const decision = trendFollowingStrategy.evaluate(
      makeSignals({ ema12: 90, ema26: 100, obv: -5000 }),
    );
    expect(decision.action).toBe('sell');
  });

  it('returns hold when signals conflict', () => {
    // EMA12 > EMA26 gives +35, but negative OBV gives -15 → net 20, below buy threshold
    const decision = trendFollowingStrategy.evaluate(
      makeSignals({ ema12: 100.1, ema26: 100, obv: -5000 }),
    );
    expect(decision.action).toBe('hold');
  });

  it('extreme greed reduces buy confidence', () => {
    const noGreed = trendFollowingStrategy.evaluate(
      makeSignals({ ema12: 115, ema26: 100, fearGreed: 50 }),
    );
    const withGreed = trendFollowingStrategy.evaluate(
      makeSignals({ ema12: 115, ema26: 100, fearGreed: 90 }),
    );
    expect(withGreed.confidence).toBeLessThanOrEqual(noGreed.confidence);
  });
});
