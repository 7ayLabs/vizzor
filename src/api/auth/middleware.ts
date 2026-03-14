// ---------------------------------------------------------------------------
// API Key authentication middleware
// ---------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { hashApiKey } from './keys.js';
import { getDb } from '../../data/cache.js';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health'];

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
  const valid = validateKey(keyHash);
  if (!valid) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Invalid API key',
    });
  }
}

function validateKey(keyHash: string): boolean {
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

    const row = db.prepare('SELECT key_hash FROM api_keys WHERE revoked_at IS NULL').all() as {
      key_hash: string;
    }[];

    if (row.length === 0) {
      // No keys registered — deny by default (require key creation first)
      return false;
    }

    // Constant-time comparison against all valid key hashes
    const inputBuf = Buffer.from(keyHash, 'hex');
    for (const r of row) {
      const storedBuf = Buffer.from(r.key_hash, 'hex');
      if (inputBuf.length === storedBuf.length && timingSafeEqual(inputBuf, storedBuf)) {
        return true;
      }
    }

    return false;
  } catch {
    // DB unavailable — deny access
    return false;
  }
}
