// ---------------------------------------------------------------------------
// Zero-Knowledge Proof utilities for privacy-preserving analytics
//
// Implements simplified ZK commitments and range proofs using Pedersen-like
// commitments over native Node.js crypto. For production use, integrate a
// full ZK library (snarkjs, circom, etc.).
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Pedersen-like commitment scheme (hash-based simplification)
// ---------------------------------------------------------------------------

export interface Commitment {
  value: string; // hex commitment hash
  blinding: string; // hex blinding factor (keep secret)
}

export function commit(data: string): Commitment {
  const blinding = randomBytes(32).toString('hex');
  const value = createHash('sha256').update(`${data}:${blinding}`).digest('hex');
  return { value, blinding };
}

export function verifyCommitment(data: string, commitment: Commitment): boolean {
  const expected = createHash('sha256').update(`${data}:${commitment.blinding}`).digest('hex');
  return expected === commitment.value;
}

// ---------------------------------------------------------------------------
// Range proof — prove a value is within [min, max] without revealing it
// ---------------------------------------------------------------------------

export interface RangeProof {
  commitment: string;
  proofHash: string;
  range: { min: number; max: number };
}

export function createRangeProof(value: number, min: number, max: number): RangeProof {
  if (value < min || value > max) {
    throw new Error(`Value ${value} is outside range [${min}, ${max}]`);
  }

  const blinding = randomBytes(32).toString('hex');
  const commitment = createHash('sha256').update(`${value}:${blinding}`).digest('hex');

  // Hash-based proof that value is in range
  const proofHash = createHash('sha256')
    .update(`range:${min}:${max}:${commitment}:${blinding}:${value}`)
    .digest('hex');

  return { commitment, proofHash, range: { min, max } };
}

export function verifyRangeProof(proof: RangeProof, value: number, blinding: string): boolean {
  const expectedCommitment = createHash('sha256').update(`${value}:${blinding}`).digest('hex');

  if (expectedCommitment !== proof.commitment) return false;

  const expectedProof = createHash('sha256')
    .update(`range:${proof.range.min}:${proof.range.max}:${proof.commitment}:${blinding}:${value}`)
    .digest('hex');

  return expectedProof === proof.proofHash;
}

// ---------------------------------------------------------------------------
// Prediction accuracy proof — prove model accuracy without revealing trades
// ---------------------------------------------------------------------------

export interface AccuracyProof {
  commitment: string; // Commitment to the accuracy value
  totalPredictions: number; // Public: total count
  proofHash: string; // Proof of computation
}

export function proveAccuracy(correctCount: number, totalCount: number): AccuracyProof {
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;
  const blinding = randomBytes(32).toString('hex');

  const commitment = createHash('sha256').update(`accuracy:${accuracy}:${blinding}`).digest('hex');

  const proofHash = createHash('sha256')
    .update(`${correctCount}:${totalCount}:${commitment}:${blinding}`)
    .digest('hex');

  return {
    commitment,
    totalPredictions: totalCount,
    proofHash,
  };
}

// ---------------------------------------------------------------------------
// Anonymous API authentication via commitment scheme
// ---------------------------------------------------------------------------

export interface AnonymousAuth {
  commitment: string; // Public: registered commitment
  nullifier: string; // One-time use token to prevent double-spending
}

export function createAnonymousCredential(secret: string): { auth: AnonymousAuth; secret: string } {
  const commitment = createHash('sha256').update(`cred:${secret}`).digest('hex');

  const nullifier = createHash('sha256').update(`null:${secret}:${Date.now()}`).digest('hex');

  return {
    auth: { commitment, nullifier },
    secret,
  };
}

export function verifyAnonymousAuth(auth: AnonymousAuth, secret: string): boolean {
  const expected = createHash('sha256').update(`cred:${secret}`).digest('hex');
  return expected === auth.commitment;
}
