// ---------------------------------------------------------------------------
// Certainty Factor (CF) Algebra — Shortliffe-Buchanan (1975)
// Combines confidence from multiple evidence sources without the
// "averaging to zero" problem of arithmetic means.
//
// CF range: [-1, 1] where:
//   +1 = absolute certainty (bullish)
//   -1 = absolute certainty (bearish)
//    0 = no evidence / unknown
//
// Key property: CF = 0 sources are IGNORED — they don't dilute the result.
// ---------------------------------------------------------------------------

/**
 * Combine two certainty factors using the Shortliffe-Buchanan formula:
 *
 * Both positive:  CF = CF1 + CF2 * (1 - CF1)
 * Both negative:  CF = CF1 + CF2 * (1 + CF1)
 * Mixed signs:    CF = (CF1 + CF2) / (1 - min(|CF1|, |CF2|))
 *
 * @param cf1 First certainty factor [-1, 1]
 * @param cf2 Second certainty factor [-1, 1]
 * @returns Combined certainty factor [-1, 1]
 */
export function combineCF(cf1: number, cf2: number): number {
  // Clamp inputs to valid range
  const a = Math.max(-1, Math.min(1, cf1));
  const b = Math.max(-1, Math.min(1, cf2));

  // Skip zero-evidence sources
  if (a === 0) return b;
  if (b === 0) return a;

  if (a > 0 && b > 0) {
    // Both positive: asymptotically approaches 1
    return a + b * (1 - a);
  }

  if (a < 0 && b < 0) {
    // Both negative: asymptotically approaches -1
    return a + b * (1 + a);
  }

  // Mixed signs: opposing evidence
  const denominator = 1 - Math.min(Math.abs(a), Math.abs(b));
  if (denominator === 0) return 0; // perfectly cancelling evidence
  return (a + b) / denominator;
}

/**
 * Combine multiple certainty factors via left-fold.
 * Filters out CF = 0 (no evidence) before combining.
 *
 * @param cfs Array of certainty factors [-1, 1]
 * @returns Combined certainty factor, or 0 if all are zero / empty
 */
export function combineMultipleCF(cfs: number[]): number {
  // Filter out zero-evidence signals
  const active = cfs.filter((cf) => cf !== 0);
  if (active.length === 0) return 0;

  let result = active[0] ?? 0;
  for (let i = 1; i < active.length; i++) {
    result = combineCF(result, active[i] ?? 0);
  }

  // Clamp final result to [-1, 1]
  return Math.max(-1, Math.min(1, result));
}

/**
 * Compute a weighted certainty factor: scales CF by the weight of the evidence.
 * Useful for weighting signals before combining.
 *
 * @param cf Raw certainty factor [-1, 1]
 * @param weight Evidence weight [0, 1]
 * @returns Weighted certainty factor [-1, 1]
 */
export function weightedCF(cf: number, weight: number): number {
  const w = Math.max(0, Math.min(1, weight));
  return Math.max(-1, Math.min(1, cf * w));
}
