// ---------------------------------------------------------------------------
// Kolmogorov Probability Axioms — ensures all probabilities are valid
//
// Axiom 1 (Non-negativity):    P(A) >= 0
// Axiom 2 (Normalization):     P(Omega) = 1
// Axiom 3 (Countable Additivity): P(A u B) = P(A) + P(B) when A n B = empty
// ---------------------------------------------------------------------------

/**
 * Clamp a probability value to [0, 1] (Axiom 1 + Axiom 2 enforcement).
 */
export function clampProbability(p: number): number {
  if (!isFinite(p)) return 0.5; // NaN/Infinity → uninformative
  return Math.max(0, Math.min(1, p));
}

/**
 * Convert a certainty factor ([-1, 1]) to a probability ([0, 1]).
 *
 * Mapping: CF = -1 → P = 0, CF = 0 → P = 0.5, CF = +1 → P = 1
 * Formula: P = (CF + 1) / 2
 */
export function cfToProbability(cf: number): number {
  return clampProbability((cf + 1) / 2);
}

/**
 * Convert a probability ([0, 1]) back to a certainty factor ([-1, 1]).
 *
 * Formula: CF = 2P - 1
 */
export function probabilityToCF(p: number): number {
  const clamped = clampProbability(p);
  return clamped * 2 - 1;
}

/**
 * Normalize a distribution so values sum to 1.0 (Axiom 2 enforcement).
 * Returns uniform distribution if sum is zero.
 *
 * @param dist Array of non-negative values
 * @returns Normalized probability distribution that sums to 1.0
 */
export function normalizeDistribution(dist: number[]): number[] {
  if (dist.length === 0) return [];

  // Enforce non-negativity (Axiom 1)
  const nonNeg = dist.map((v) => Math.max(0, v));
  const sum = nonNeg.reduce((a, b) => a + b, 0);

  if (sum === 0) {
    // Uniform distribution when no information
    const uniform = 1 / dist.length;
    return new Array(dist.length).fill(uniform) as number[];
  }

  return nonNeg.map((v) => v / sum);
}

/**
 * Compute the complement probability: P(not A) = 1 - P(A).
 */
export function complement(p: number): number {
  return clampProbability(1 - clampProbability(p));
}

/**
 * Joint probability for independent events: P(A and B) = P(A) * P(B).
 * Only valid when A and B are independent.
 */
export function jointIndependent(pA: number, pB: number): number {
  return clampProbability(clampProbability(pA) * clampProbability(pB));
}

/**
 * Union probability: P(A or B) = P(A) + P(B) - P(A and B).
 * Enforces Axiom 3 (additivity for disjoint events) as a special case.
 */
export function union(pA: number, pB: number, pAandB: number): number {
  return clampProbability(clampProbability(pA) + clampProbability(pB) - clampProbability(pAandB));
}
