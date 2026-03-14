// ---------------------------------------------------------------------------
// HMAC request signing — ensures API request integrity
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'node:crypto';

const HMAC_ALGORITHM = 'sha256';

export function signRequest(
  method: string,
  path: string,
  body: string,
  secret: string,
  timestamp: number,
): string {
  const payload = `${method}\n${path}\n${timestamp}\n${body}`;
  return createHmac(HMAC_ALGORITHM, secret).update(payload).digest('hex');
}

export function verifySignature(
  method: string,
  path: string,
  body: string,
  secret: string,
  timestamp: number,
  signature: string,
  maxAgeMs = 300_000, // 5 minutes
): boolean {
  // Check timestamp freshness to prevent replay attacks
  const now = Date.now();
  if (Math.abs(now - timestamp) > maxAgeMs) return false;

  const expected = signRequest(method, path, body, secret, timestamp);

  // Constant-time comparison
  const sig = Buffer.from(signature, 'hex');
  const exp = Buffer.from(expected, 'hex');
  if (sig.length !== exp.length) return false;

  return timingSafeEqual(sig, exp);
}
