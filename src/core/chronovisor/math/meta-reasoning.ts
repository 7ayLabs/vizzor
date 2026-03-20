// ---------------------------------------------------------------------------
// Second-Order Logic (SOL) Meta-Reasoning
//
// Reasons about the QUALITY of the prediction process itself:
// - Are enough signals active? (completeness)
// - Do signals agree? (consensus)
// - Have these signals been historically reliable? (track record)
// - Is the market regime favorable for prediction? (volatility)
//
// Produces a meta-confidence modifier [0.3, 1.0] that scales the
// final probability to prevent overconfident predictions when the
// reasoning process itself is unreliable.
// ---------------------------------------------------------------------------

import { clampProbability } from './probability.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetaFactors {
  /** Fraction of signals that returned non-zero data [0, 1] */
  signalCompleteness: number;

  /** Fraction of active signals agreeing on the same direction [0, 1] */
  signalAgreement: number;

  /** Average per-signal historical accuracy [0, 1] */
  historicalReliability: number;

  /** Current regime volatility — high = unpredictable [0, 1] */
  regimeVolatility: number;
}

export interface MetaReasoningConfig {
  /** Minimum completeness below which confidence is heavily penalized */
  minCompleteness: number;
  /** Bonus multiplier for high signal agreement */
  agreementBonus: number;
  /** Penalty multiplier for high volatility */
  volatilityPenalty: number;
  /** Floor — meta-confidence never goes below this */
  floor: number;
  /** Ceiling — meta-confidence never goes above this */
  ceiling: number;
}

const DEFAULT_CONFIG: MetaReasoningConfig = {
  minCompleteness: 0.3,
  agreementBonus: 0.15,
  volatilityPenalty: 0.2,
  floor: 0.3,
  ceiling: 1.0,
};

// ---------------------------------------------------------------------------
// Meta-reasoning computation
// ---------------------------------------------------------------------------

/**
 * Compute a meta-confidence modifier that reflects how trustworthy the
 * current prediction process is.
 *
 * Formula:
 *   base = completeness * 0.8 + 0.2  (ranges 0.2 to 1.0)
 *   + agreementBonus if agreement > 0.7
 *   - volatilityPenalty * regimeVolatility
 *   * reliabilityMultiplier (0.5 if no history, up to 1.2 if very accurate)
 *   clamped to [floor, ceiling]
 *
 * @param factors Current meta-factors from the prediction pipeline
 * @param config Configurable parameters (optional, uses defaults)
 * @returns Meta-confidence modifier [floor, ceiling]
 */
export function computeMetaConfidence(
  factors: MetaFactors,
  config: MetaReasoningConfig = DEFAULT_CONFIG,
): number {
  const { signalCompleteness, signalAgreement, historicalReliability, regimeVolatility } = factors;

  // Base confidence from signal completeness
  // 0% signals → 0.2, 50% signals → 0.6, 100% signals → 1.0
  let meta = clampProbability(signalCompleteness) * 0.8 + 0.2;

  // Penalty if below minimum completeness threshold
  if (signalCompleteness < config.minCompleteness) {
    meta *= 0.6; // heavy penalty for very sparse data
  }

  // Bonus for high signal agreement (consensus)
  if (signalAgreement > 0.7) {
    meta += (config.agreementBonus * (signalAgreement - 0.7)) / 0.3;
  }
  // Penalty for low agreement (conflicting signals)
  if (signalAgreement < 0.4) {
    meta -= (0.1 * (0.4 - signalAgreement)) / 0.4;
  }

  // Volatility penalty — high volatility reduces confidence
  meta -= config.volatilityPenalty * clampProbability(regimeVolatility);

  // Historical reliability multiplier
  // No history (0) → multiply by 0.7 (uncertain)
  // 50% accuracy → multiply by 1.0 (neutral)
  // 80% accuracy → multiply by 1.15 (boost)
  const reliabilityMultiplier =
    historicalReliability > 0 ? 0.5 + historicalReliability * 0.75 : 0.7; // no data = conservative
  meta *= reliabilityMultiplier;

  // Clamp to configured bounds
  return Math.max(config.floor, Math.min(config.ceiling, meta));
}

/**
 * Compute signal completeness: ratio of non-zero signals to total signals.
 *
 * @param signalCFs Array of signal certainty factors
 * @returns Completeness ratio [0, 1]
 */
export function computeSignalCompleteness(signalCFs: number[]): number {
  if (signalCFs.length === 0) return 0;
  const active = signalCFs.filter((cf) => cf !== 0).length;
  return active / signalCFs.length;
}

/**
 * Compute signal agreement: fraction of active signals pointing in the
 * same direction as the majority.
 *
 * @param signalCFs Array of signal certainty factors
 * @returns Agreement ratio [0, 1]
 */
export function computeSignalAgreement(signalCFs: number[]): number {
  const active = signalCFs.filter((cf) => cf !== 0);
  if (active.length <= 1) return 1; // single signal = perfect "agreement"

  const bullish = active.filter((cf) => cf > 0).length;
  const bearish = active.filter((cf) => cf < 0).length;

  return Math.max(bullish, bearish) / active.length;
}
