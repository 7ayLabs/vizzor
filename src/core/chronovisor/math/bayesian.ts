// ---------------------------------------------------------------------------
// Bayesian Updates — sequential evidence incorporation
//
// Bayes' Theorem: P(H|E) = P(E|H) * P(H) / P(E)
//
// For prediction: H = "price goes up", E = signal evidence
// - prior:      P(H) = initial belief (0.5 = uninformative)
// - likelihood: P(E|H) = how likely is this evidence if hypothesis is true
// - evidence:   P(E) = overall probability of observing this evidence
// - posterior:  P(H|E) = updated belief after seeing evidence
// ---------------------------------------------------------------------------

import { clampProbability } from './probability.js';

/**
 * Single Bayesian update: computes posterior from prior, likelihood, and evidence.
 *
 * P(H|E) = P(E|H) * P(H) / P(E)
 *
 * @param prior P(H) - prior probability of hypothesis [0, 1]
 * @param likelihood P(E|H) - probability of evidence given hypothesis [0, 1]
 * @param evidence P(E) - marginal probability of evidence [0, 1]
 * @returns Posterior probability P(H|E) [0, 1]
 */
export function bayesianUpdate(prior: number, likelihood: number, evidence: number): number {
  const p = clampProbability(prior);
  const l = clampProbability(likelihood);
  const e = clampProbability(evidence);

  // Avoid division by zero — if evidence is impossible, return prior
  if (e === 0) return p;

  return clampProbability((l * p) / e);
}

/**
 * Sequential Bayesian updates: iteratively incorporates multiple pieces of
 * evidence, where each update's posterior becomes the next update's prior.
 *
 * @param prior Initial prior probability P(H) [0, 1]
 * @param evidencePairs Array of {likelihood, evidence} pairs
 * @returns Final posterior after all evidence incorporated [0, 1]
 */
export function sequentialBayesianUpdate(
  prior: number,
  evidencePairs: { likelihood: number; evidence: number }[],
): number {
  let current = clampProbability(prior);

  for (const { likelihood, evidence } of evidencePairs) {
    current = bayesianUpdate(current, likelihood, evidence);
  }

  return current;
}

/**
 * Estimate likelihood from signal certainty factor and agreement with hypothesis.
 *
 * If a signal with CF = 0.6 agrees with the hypothesis (bullish signal for bullish hypothesis):
 *   likelihood = 0.5 + CF/2 = 0.8 (strong evidence FOR the hypothesis)
 *
 * If the same signal disagrees:
 *   likelihood = 0.5 - CF/2 = 0.2 (strong evidence AGAINST the hypothesis)
 *
 * @param cf Signal certainty factor [-1, 1]
 * @param agrees Whether the signal direction agrees with the hypothesis
 * @returns Estimated likelihood [0, 1]
 */
export function estimateLikelihood(cf: number, agrees: boolean): number {
  const absCF = Math.abs(Math.max(-1, Math.min(1, cf)));
  if (agrees) {
    return clampProbability(0.5 + absCF / 2);
  }
  return clampProbability(0.5 - absCF / 2);
}

/**
 * Estimate marginal evidence probability P(E) using the law of total probability:
 *   P(E) = P(E|H)*P(H) + P(E|not H)*P(not H)
 *
 * @param likelihood P(E|H)
 * @param prior P(H)
 * @param likelihoodComplement P(E|not H) - optional, defaults to 1 - likelihood
 * @returns P(E)
 */
export function estimateEvidence(
  likelihood: number,
  prior: number,
  likelihoodComplement?: number,
): number {
  const l = clampProbability(likelihood);
  const p = clampProbability(prior);
  const lComp = likelihoodComplement !== undefined ? clampProbability(likelihoodComplement) : 1 - l;

  return clampProbability(l * p + lComp * (1 - p));
}

/**
 * Build evidence pairs from signal data for sequential Bayesian updating.
 * Each signal becomes an evidence pair: {likelihood, evidence}.
 *
 * @param signals Array of { cf, agreesWithHypothesis }
 * @param prior Starting prior for evidence estimation
 * @returns Evidence pairs ready for sequentialBayesianUpdate
 */
export function buildEvidencePairs(
  signals: { cf: number; agrees: boolean }[],
  prior: number,
): { likelihood: number; evidence: number }[] {
  let currentPrior = clampProbability(prior);
  const pairs: { likelihood: number; evidence: number }[] = [];

  for (const signal of signals) {
    // Skip zero-evidence signals
    if (signal.cf === 0) continue;

    const likelihood = estimateLikelihood(signal.cf, signal.agrees);
    const evidence = estimateEvidence(likelihood, currentPrior);

    pairs.push({ likelihood, evidence });

    // Update running prior for evidence estimation of next signal
    if (evidence > 0) {
      currentPrior = clampProbability((likelihood * currentPrior) / evidence);
    }
  }

  return pairs;
}
