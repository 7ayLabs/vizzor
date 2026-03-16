// ---------------------------------------------------------------------------
// API Key authentication middleware with per-key rate limiting
// ---------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { hashApiKey } from './keys.js';
import { getDb } from '../../data/cache.js';
import { logAuditEvent } from '../../security/audit.js';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health'];

// Per-key rate limit tracking
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Rate limit window in milliseconds (1 minute)
const RATE_LIMIT_WINDOW_MS = 60_000;

export interface AuthenticatedKeyInfo {
  keyPrefix: string;
  rateLimit: number;
}

// Augment request with key info for downstream use
declare module 'fastify' {
  interface FastifyRequest {
    apiKeyInfo?: AuthenticatedKeyInfo;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Skip auth only for health check
  if (PUBLIC_PATHS.some((p) => request.url === p)) {
    return;
  }

  // Gate /docs behind NODE_ENV — only in development
  if (request.url === '/docs' || request.url.startsWith('/docs/')) {
    if (process.env['NODE_ENV'] === 'production') {
      return reply.status(404).send({ error: 'Not found' });
    }
    return;
  }

  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (!apiKey || apiKey.length > 256) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid X-API-Key header',
    });
  }

  const keyHash = hashApiKey(apiKey);
  const keyInfo = validateKey(keyHash);
  if (!keyInfo) {
    logAuditEvent({
      type: 'auth_failure',
      actor: `hash:${keyHash.slice(0, 8)}...`,
      resource: request.url,
      action: 'Invalid API key used',
      ip: request.ip,
    });
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Invalid API key',
    });
  }

  // Per-key rate limiting
  const now = Date.now();
  let entry = rateLimitMap.get(keyInfo.keyPrefix);

  if (!entry || now >= entry.resetAt) {
    // Start new window
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(keyInfo.keyPrefix, entry);
  }

  entry.count++;

  if (entry.count > keyInfo.rateLimit) {
    logAuditEvent({
      type: 'rate_limit_exceeded',
      actor: keyInfo.keyPrefix,
      resource: request.url,
      action: `Rate limit exceeded: ${entry.count}/${keyInfo.rateLimit} per minute`,
      ip: request.ip,
    });
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return reply
      .status(429)
      .header('Retry-After', String(retryAfter))
      .send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Limit: ${keyInfo.rateLimit} requests per minute`,
        retryAfter,
      });
  }

  // Decorate request with key info for downstream use
  request.apiKeyInfo = keyInfo;
}

function validateKey(keyHash: string): AuthenticatedKeyInfo | null {
  try {
    const db = getDb();

    // Ensure api_keys table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        rate_limit INTEGER NOT NULL DEFAULT 100,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      )
    `);

    const rows = db
      .prepare('SELECT key_hash, key_prefix, rate_limit FROM api_keys WHERE revoked_at IS NULL')
      .all() as {
      key_hash: string;
      key_prefix: string;
      rate_limit: number;
    }[];

    if (rows.length === 0) {
      // No keys registered — deny by default (require key creation first)
      return null;
    }

    // Constant-time comparison against all valid key hashes
    const inputBuf = Buffer.from(keyHash, 'hex');
    for (const r of rows) {
      const storedBuf = Buffer.from(r.key_hash, 'hex');
      if (inputBuf.length === storedBuf.length && timingSafeEqual(inputBuf, storedBuf)) {
        return {
          keyPrefix: r.key_prefix,
          rateLimit: r.rate_limit,
        };
      }
    }

    return null;
  } catch {
    // DB unavailable — deny access
    return null;
  }
}
