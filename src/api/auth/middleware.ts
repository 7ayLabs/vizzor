// ---------------------------------------------------------------------------
// API Key authentication middleware
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getStoreInstance } from '../../data/store-factory.js';

// Paths that don't require authentication
const PUBLIC_PATHS = ['/health', '/docs', '/docs/'];

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Skip auth for public paths and swagger assets
  if (PUBLIC_PATHS.some((p) => request.url === p) || request.url.startsWith('/docs/')) {
    return;
  }

  const apiKey = request.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
  }

  const keyHash = hashKey(apiKey);
  const valid = await validateKey(keyHash);
  if (!valid) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Invalid API key',
    });
  }
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

async function validateKey(keyHash: string): Promise<boolean> {
  const store = getStoreInstance();
  if (!store) return false;

  // Check against cached keys for SQLite, or DB for Postgres
  const cached = await store.getCached<{ valid: boolean }>(`apikey:${keyHash}`);
  if (cached !== null) return cached.valid;

  // For now, accept any non-empty key when no store has api_keys table
  // In production, this would query the api_keys table
  return true;
}
