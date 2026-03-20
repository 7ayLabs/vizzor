import { describe, it, expect } from 'vitest';
import {
  bayesianUpdate,
  sequentialBayesianUpdate,
  estimateLikelihood,
  estimateEvidence,
  buildEvidencePairs,
} from '../../../../../src/core/chronovisor/math/bayesian.js';

describe('Bayesian Updates', () => {
  describe('bayesianUpdate', () => {
    it('updates prior with evidence', () => {
      // P(H|E) = P(E|H) * P(H) / P(E)
      // 0.8 * 0.5 / 0.6 = 0.667
      const result = bayesianUpdate(0.5, 0.8, 0.6);
      expect(result).toBeCloseTo(0.667, 2);
    });

    it('returns prior when evidence is 0', () => {
      const result = bayesianUpdate(0.5, 0.8, 0);
      expect(result).toBe(0.5);
    });

    it('stays within [0, 1]', () => {
      const result = bayesianUpdate(0.9, 0.95, 0.1);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });

  describe('sequentialBayesianUpdate', () => {
    it('iteratively updates from prior', () => {
      const result = sequentialBayesianUpdate(0.5, [
        { likelihood: 0.8, evidence: 0.6 },
        { likelihood: 0.7, evidence: 0.55 },
      ]);
      // Each update should move probability away from 0.5
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('returns prior when no evidence', () => {
      expect(sequentialBayesianUpdate(0.5, [])).toBe(0.5);
    });

    it('converges with strong evidence', () => {
      const result = sequentialBayesianUpdate(0.5, [
        { likelihood: 0.9, evidence: 0.5 },
        { likelihood: 0.9, evidence: 0.5 },
        { likelihood: 0.9, evidence: 0.5 },
      ]);
      expect(result).toBeGreaterThan(0.8);
    });
  });

  describe('estimateLikelihood', () => {
    it('returns high likelihood when signal agrees', () => {
      const result = estimateLikelihood(0.8, true);
      expect(result).toBeCloseTo(0.9, 2);
    });

    it('returns low likelihood when signal disagrees', () => {
      const result = estimateLikelihood(0.8, false);
      expect(result).toBeCloseTo(0.1, 2);
    });

    it('returns 0.5 for zero CF', () => {
      expect(estimateLikelihood(0, true)).toBeCloseTo(0.5, 2);
      expect(estimateLikelihood(0, false)).toBeCloseTo(0.5, 2);
    });
  });

  describe('estimateEvidence', () => {
    it('computes marginal probability', () => {
      // P(E) = P(E|H)*P(H) + P(E|~H)*P(~H)
      // = 0.8*0.5 + 0.2*0.5 = 0.5
      const result = estimateEvidence(0.8, 0.5);
      expect(result).toBeCloseTo(0.5, 2);
    });
  });

  describe('buildEvidencePairs', () => {
    it('builds pairs from signals', () => {
      const pairs = buildEvidencePairs(
        [
          { cf: 0.6, agrees: true },
          { cf: 0.4, agrees: true },
        ],
        0.5,
      );
      expect(pairs).toHaveLength(2);
      expect(pairs[0]?.likelihood).toBeGreaterThan(0.5);
    });

    it('skips zero CF signals', () => {
      const pairs = buildEvidencePairs(
        [
          { cf: 0, agrees: true },
          { cf: 0.6, agrees: true },
        ],
        0.5,
      );
      expect(pairs).toHaveLength(1);
    });
  });
});
