import { describe, it, expect } from 'vitest';
import {
  computeMetaConfidence,
  computeSignalCompleteness,
  computeSignalAgreement,
} from '../../../../../src/core/chronovisor/math/meta-reasoning.js';

describe('Second-Order Meta-Reasoning', () => {
  describe('computeMetaConfidence', () => {
    it('returns high confidence with complete, agreeing signals', () => {
      const result = computeMetaConfidence({
        signalCompleteness: 1.0,
        signalAgreement: 0.9,
        historicalReliability: 0.7,
        regimeVolatility: 0.1,
      });
      expect(result).toBeGreaterThan(0.7);
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('returns low confidence with sparse signals', () => {
      const result = computeMetaConfidence({
        signalCompleteness: 0.2,
        signalAgreement: 1.0,
        historicalReliability: 0.5,
        regimeVolatility: 0.1,
      });
      // Below minCompleteness (0.3) → heavy penalty
      expect(result).toBeLessThan(0.5);
    });

    it('penalizes high volatility', () => {
      const lowVol = computeMetaConfidence({
        signalCompleteness: 0.8,
        signalAgreement: 0.7,
        historicalReliability: 0.6,
        regimeVolatility: 0.1,
      });
      const highVol = computeMetaConfidence({
        signalCompleteness: 0.8,
        signalAgreement: 0.7,
        historicalReliability: 0.6,
        regimeVolatility: 0.9,
      });
      expect(highVol).toBeLessThan(lowVol);
    });

    it('never goes below floor (0.3)', () => {
      const result = computeMetaConfidence({
        signalCompleteness: 0,
        signalAgreement: 0,
        historicalReliability: 0,
        regimeVolatility: 1,
      });
      expect(result).toBeGreaterThanOrEqual(0.3);
    });

    it('never exceeds ceiling (1.0)', () => {
      const result = computeMetaConfidence({
        signalCompleteness: 1,
        signalAgreement: 1,
        historicalReliability: 1,
        regimeVolatility: 0,
      });
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('is conservative with no historical data', () => {
      const withHistory = computeMetaConfidence({
        signalCompleteness: 0.8,
        signalAgreement: 0.8,
        historicalReliability: 0.7,
        regimeVolatility: 0.2,
      });
      const noHistory = computeMetaConfidence({
        signalCompleteness: 0.8,
        signalAgreement: 0.8,
        historicalReliability: 0, // no data
        regimeVolatility: 0.2,
      });
      expect(noHistory).toBeLessThan(withHistory);
    });
  });

  describe('computeSignalCompleteness', () => {
    it('returns 0 for empty array', () => {
      expect(computeSignalCompleteness([])).toBe(0);
    });

    it('returns ratio of non-zero signals', () => {
      expect(computeSignalCompleteness([0.5, 0, 0.3, 0, 0.1])).toBeCloseTo(0.6, 5);
    });

    it('returns 1 when all signals are active', () => {
      expect(computeSignalCompleteness([0.5, 0.3, 0.1])).toBe(1);
    });
  });

  describe('computeSignalAgreement', () => {
    it('returns 1 for single signal', () => {
      expect(computeSignalAgreement([0.5])).toBe(1);
    });

    it('returns 1 when all agree on direction', () => {
      expect(computeSignalAgreement([0.5, 0.3, 0.1])).toBe(1);
    });

    it('returns 0.5 for split signals', () => {
      expect(computeSignalAgreement([0.5, -0.3])).toBeCloseTo(0.5, 5);
    });

    it('ignores zero signals', () => {
      expect(computeSignalAgreement([0.5, 0, 0, -0.3])).toBeCloseTo(0.5, 5);
    });
  });
});
