import { describe, it, expect } from 'vitest';
import {
  clampProbability,
  cfToProbability,
  probabilityToCF,
  normalizeDistribution,
  complement,
  jointIndependent,
  union,
} from '../../../../../src/core/chronovisor/math/probability.js';

describe('Kolmogorov Probability', () => {
  describe('clampProbability', () => {
    it('clamps to [0, 1]', () => {
      expect(clampProbability(-0.5)).toBe(0);
      expect(clampProbability(1.5)).toBe(1);
      expect(clampProbability(0.5)).toBe(0.5);
    });

    it('handles NaN and Infinity', () => {
      expect(clampProbability(NaN)).toBe(0.5);
      expect(clampProbability(Infinity)).toBe(0.5);
      expect(clampProbability(-Infinity)).toBe(0.5);
    });
  });

  describe('cfToProbability', () => {
    it('maps CF=-1 to P=0', () => {
      expect(cfToProbability(-1)).toBeCloseTo(0, 5);
    });

    it('maps CF=0 to P=0.5', () => {
      expect(cfToProbability(0)).toBeCloseTo(0.5, 5);
    });

    it('maps CF=+1 to P=1', () => {
      expect(cfToProbability(1)).toBeCloseTo(1, 5);
    });
  });

  describe('probabilityToCF', () => {
    it('maps P=0 to CF=-1', () => {
      expect(probabilityToCF(0)).toBeCloseTo(-1, 5);
    });

    it('maps P=0.5 to CF=0', () => {
      expect(probabilityToCF(0.5)).toBeCloseTo(0, 5);
    });

    it('maps P=1 to CF=+1', () => {
      expect(probabilityToCF(1)).toBeCloseTo(1, 5);
    });

    it('round-trips with cfToProbability', () => {
      for (const cf of [-0.8, -0.3, 0, 0.3, 0.8]) {
        expect(probabilityToCF(cfToProbability(cf))).toBeCloseTo(cf, 5);
      }
    });
  });

  describe('normalizeDistribution', () => {
    it('normalizes to sum = 1', () => {
      const dist = normalizeDistribution([3, 5, 2]);
      expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      expect(dist[0]).toBeCloseTo(0.3, 5);
      expect(dist[1]).toBeCloseTo(0.5, 5);
      expect(dist[2]).toBeCloseTo(0.2, 5);
    });

    it('returns uniform for all-zero input', () => {
      const dist = normalizeDistribution([0, 0, 0]);
      expect(dist).toEqual([1 / 3, 1 / 3, 1 / 3]);
    });

    it('returns empty for empty input', () => {
      expect(normalizeDistribution([])).toEqual([]);
    });

    it('enforces non-negativity (Axiom 1)', () => {
      const dist = normalizeDistribution([-1, 2, 3]);
      expect(dist[0]).toBe(0);
      expect(dist.every((v) => v >= 0)).toBe(true);
    });
  });

  describe('complement', () => {
    it('returns 1 - P', () => {
      expect(complement(0.7)).toBeCloseTo(0.3, 5);
      expect(complement(0)).toBeCloseTo(1, 5);
      expect(complement(1)).toBeCloseTo(0, 5);
    });
  });

  describe('jointIndependent', () => {
    it('multiplies independent probabilities', () => {
      expect(jointIndependent(0.5, 0.4)).toBeCloseTo(0.2, 5);
    });
  });

  describe('union', () => {
    it('computes union correctly', () => {
      // P(A or B) = P(A) + P(B) - P(A and B)
      expect(union(0.5, 0.3, 0.1)).toBeCloseTo(0.7, 5);
    });
  });
});
