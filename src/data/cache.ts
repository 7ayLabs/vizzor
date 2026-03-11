import Database from 'better-sqlite3';
import { join } from 'node:path';
import { getConfigDir } from '../config/loader.js';

let db: Database.Database | null = null;

/**
 * Returns the lazily-initialized SQLite database instance.
 * Enables WAL mode and creates tables on first access.
 */
export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = join(getConfigDir(), 'vizzor.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('wallet', 'token', 'project')),
      identifier TEXT NOT NULL,
      chain TEXT NOT NULL DEFAULT 'ethereum',
      label TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE (type, identifier, chain)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT NOT NULL,
      input TEXT NOT NULL,
      result TEXT NOT NULL,
      chain TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  return db;
}

/**
 * Returns a cached value parsed from JSON, or null if the key does not exist
 * or has expired.
 */
export function getCached<T = unknown>(key: string): T | null {
  const row = getDb().prepare('SELECT value, expires_at FROM cache WHERE key = ?').get(key) as
    | { value: string; expires_at: number }
    | undefined;

  if (!row) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at <= now) {
    getDb().prepare('DELETE FROM cache WHERE key = ?').run(key);
    return null;
  }

  return JSON.parse(row.value) as T;
}

/**
 * Inserts or replaces a cached value with the given TTL in seconds.
 */
export function setCache(key: string, value: unknown, ttlSeconds: number): void {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;

  getDb()
    .prepare(
      `INSERT OR REPLACE INTO cache (key, value, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(key, JSON.stringify(value), expiresAt, now);
}

/**
 * Deletes all expired cache entries.
 */
export function clearExpired(): void {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare('DELETE FROM cache WHERE expires_at <= ?').run(now);
}
