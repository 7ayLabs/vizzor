// ---------------------------------------------------------------------------
// API Key management — create, list, revoke keys
// ---------------------------------------------------------------------------

import { randomBytes, createHash } from 'node:crypto';
import { getDb } from '../../data/cache.js';

function ensureKeysTable(): void {
  getDb().exec(`
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
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  keyPrefix: string;
  rateLimit: number;
  createdAt: number;
  revokedAt: number | null;
}

export function createApiKey(label: string): { key: string; record: ApiKeyRecord } {
  ensureKeysTable();

  const rawKey = `vzr_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12) + '...';
  const id = randomBytes(16).toString('hex');
  const now = Date.now();

  getDb()
    .prepare(
      `INSERT INTO api_keys (id, label, key_hash, key_prefix, rate_limit, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, label, keyHash, keyPrefix, 100, now);

  return {
    key: rawKey,
    record: { id, label, keyPrefix, rateLimit: 100, createdAt: now, revokedAt: null },
  };
}

export function listApiKeys(): ApiKeyRecord[] {
  ensureKeysTable();

  const rows = getDb()
    .prepare('SELECT * FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC')
    .all() as {
    id: string;
    label: string;
    key_prefix: string;
    rate_limit: number;
    created_at: number;
    revoked_at: number | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    keyPrefix: r.key_prefix,
    rateLimit: r.rate_limit,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
  }));
}

export function revokeApiKey(id: string): boolean {
  ensureKeysTable();
  const result = getDb()
    .prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(Date.now(), id);
  return result.changes > 0;
}
