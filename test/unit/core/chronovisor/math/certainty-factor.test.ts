import { describe, it, expect } from 'vitest';
import {
  combineCF,
  combineMultipleCF,
  weightedCF,
} from '../../../../../src/core/chronovisor/math/certainty-factor.js';

describe('Certainty Factor Algebra', () => {
  describe('combineCF', () => {
    it('combines two positive CFs (asymptotic to 1)', () => {
      // CF(0.6, 0.7) = 0.6 + 0.7*(1-0.6) = 0.6 + 0.28 = 0.88
      const result = combineCF(0.6, 0.7);
      expect(result).toBeCloseTo(0.88, 2);
    });

    it('combines two negative CFs (asymptotic to -1)', () => {
      // CF(-0.6, -0.7) = -0.6 + (-0.7)*(1 + (-0.6)) = -0.6 + (-0.7*0.4) = -0.88
      const result = combineCF(-0.6, -0.7);
      expect(result).toBeCloseTo(-0.88, 2);
    });

    it('combines mixed positive/negative CFs', () => {
      // CF(0.8, -0.3) = (0.8 + (-0.3)) / (1 - min(0.8, 0.3)) = 0.5 / 0.7 ≈ 0.714
      const result = combineCF(0.8, -0.3);
      expect(result).toBeCloseTo(0.714, 2);
    });

    it('ignores zero CFs (no evidence)', () => {
      expect(combineCF(0.6, 0)).toBe(0.6);
      expect(combineCF(0, 0.7)).toBe(0.7);
      expect(combineCF(0, 0)).toBe(0);
    });

    it('clamps inputs to [-1, 1]', () => {
      expect(combineCF(1.5, 0.3)).toBeGreaterThanOrEqual(-1);
      expect(combineCF(1.5, 0.3)).toBeLessThanOrEqual(1);
    });

    it('returns 0 when perfectly cancelling evidence', () => {
      // When min(|a|, |b|) = 1, denominator = 0
      const result = combineCF(1, -1);
      expect(result).toBe(0);
    });
  });

  describe('combineMultipleCF', () => {
    it('returns 0 for empty array', () => {
      expect(combineMultipleCF([])).toBe(0);
    });

    it('returns 0 for all-zero array', () => {
      expect(combineMultipleCF([0, 0, 0])).toBe(0);
    });

    it('returns single non-zero value', () => {
      expect(combineMultipleCF([0, 0.6, 0])).toBe(0.6);
    });

    it('combines multiple positive CFs asymptotically', () => {
      const result = combineMultipleCF([0.6, 0.55, 0.3]);
      // Should be much higher than average (0.48)
      expect(result).toBeGreaterThan(0.7);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('ignores zero-evidence signals', () => {
      // [0.6, 0.55, 0, 0.3, 0] should equal [0.6, 0.55, 0.3]
      const withZeros = combineMultipleCF([0.6, 0.55, 0, 0.3, 0]);
      const withoutZeros = combineMultipleCF([0.6, 0.55, 0.3]);
      expect(withZeros).toBeCloseTo(withoutZeros, 10);
    });

    it('stays within [-1, 1] bounds', () => {
      const result = combineMultipleCF([0.9, 0.8, 0.7, 0.6, 0.5]);
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('weightedCF', () => {
    it('scales CF by weight', () => {
      expect(weightedCF(0.8, 0.5)).toBeCloseTo(0.4, 2);
    });

    it('returns 0 when weight is 0', () => {
      expect(weightedCF(0.8, 0)).toBe(0);
    });

    it('returns full CF when weight is 1', () => {
      expect(weightedCF(0.8, 1)).toBeCloseTo(0.8, 2);
    });

    it('clamps result to [-1, 1]', () => {
      expect(weightedCF(2, 1)).toBeLessThanOrEqual(1);
      expect(weightedCF(-2, 1)).toBeGreaterThanOrEqual(-1);
    });
  });
});
