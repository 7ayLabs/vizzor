// ---------------------------------------------------------------------------
// Security module barrel export
// ---------------------------------------------------------------------------

export { encrypt, decrypt, hashSecret, generateSecureToken } from './encryption.js';
export { signRequest, verifySignature } from './hmac.js';
export {
  logAuditEvent,
  getRecentAuditEvents,
  getAuditStats,
  type AuditEvent,
  type AuditEventType,
} from './audit.js';
export {
  commit,
  verifyCommitment,
  createRangeProof,
  verifyRangeProof,
  proveAccuracy,
  createAnonymousCredential,
  verifyAnonymousAuth,
  type Commitment,
  type RangeProof,
  type AccuracyProof,
  type AnonymousAuth,
} from './zk-proofs.js';
