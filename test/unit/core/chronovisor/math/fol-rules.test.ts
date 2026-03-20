import { describe, it, expect } from 'vitest';
import {
  evaluateRules,
  DEFAULT_RULES,
  type MarketContext,
} from '../../../../../src/core/chronovisor/math/fol-rules.js';

describe('FOL Rules Engine', () => {
  it('fires overbought_overleveraged rule', () => {
    const ctx: MarketContext = {
      rsi: 75,
      fundingRate: 0.001,
    };
    const result = evaluateRules(ctx);
    expect(result.firedRules.some((r) => r.name === 'overbought_overleveraged')).toBe(true);
    expect(result.direction).toBe('bearish');
    expect(result.cf).toBeLessThan(0);
  });

  it('fires oversold_capitulation rule', () => {
    const ctx: MarketContext = {
      rsi: 25,
      fundingRate: -0.0005,
    };
    const result = evaluateRules(ctx);
    expect(result.firedRules.some((r) => r.name === 'oversold_capitulation')).toBe(true);
    expect(result.direction).toBe('bullish');
    expect(result.cf).toBeGreaterThan(0);
  });

  it('fires smart_money_accumulation_volume rule', () => {
    const ctx: MarketContext = {
      smartMoneyFlow: 'buying',
      volume24h: 10000000,
      avgVolume: 3000000,
    };
    const result = evaluateRules(ctx);
    expect(result.firedRules.some((r) => r.name === 'smart_money_accumulation_volume')).toBe(true);
    expect(result.cf).toBeGreaterThan(0);
  });

  it('fires no rules with insufficient data', () => {
    const ctx: MarketContext = {};
    const result = evaluateRules(ctx);
    expect(result.firedRules).toHaveLength(0);
    expect(result.cf).toBe(0);
    expect(result.direction).toBe('neutral');
  });

  it('combines multiple fired rules via CF algebra', () => {
    const ctx: MarketContext = {
      rsi: 25,
      fundingRate: -0.0005,
      smartMoneyFlow: 'buying',
      volume24h: 10000000,
      avgVolume: 3000000,
      fearGreedIndex: 15,
    };
    const result = evaluateRules(ctx);
    // Multiple bullish rules should fire and combine
    expect(result.firedRules.length).toBeGreaterThan(1);
    expect(result.cf).toBeGreaterThan(0.5);
  });

  it('evaluates all default rules without errors', () => {
    // Comprehensive context — should not throw
    const ctx: MarketContext = {
      rsi: 50,
      macd: { histogram: 0, signal: 0, value: 0 },
      fundingRate: 0.0001,
      volume24h: 5000000,
      avgVolume: 5000000,
      priceChange24h: 1,
      priceChange7d: 3,
      priceVsATH: 0.7,
      smartMoneyFlow: 'neutral',
      whaleActivity: 'neutral',
      fearGreedIndex: 50,
      sentimentScore: 0,
      mlDirection: 'sideways',
      mlConfidence: 50,
      predictionMarketProbability: 0.5,
    };
    const result = evaluateRules(ctx, DEFAULT_RULES);
    expect(result.totalRulesEvaluated).toBe(DEFAULT_RULES.length);
  });
});
