import { getDb } from './cache.js';

export interface WatchlistEntry {
  id: number;
  type: string;
  identifier: string;
  chain: string;
  label: string | null;
  created_at: number;
}

export interface AnalysisHistoryEntry {
  id: number;
  command: string;
  input: string;
  result: string;
  chain: string | null;
  created_at: number;
}

/**
 * Adds an item to the watchlist. Replaces existing entries with the same
 * type, identifier, and chain combination.
 */
export function addToWatchlist(
  type: string,
  identifier: string,
  chain: string,
  label?: string,
): void {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO watchlist (type, identifier, chain, label, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(type, identifier, chain, label ?? null, now);
}

/**
 * Removes an item from the watchlist by type, identifier, and chain.
 */
export function removeFromWatchlist(type: string, identifier: string, chain: string): void {
  getDb()
    .prepare('DELETE FROM watchlist WHERE type = ? AND identifier = ? AND chain = ?')
    .run(type, identifier, chain);
}

/**
 * Returns all watchlist entries, optionally filtered by type.
 */
export function getWatchlist(type?: string): WatchlistEntry[] {
  if (type) {
    return getDb()
      .prepare('SELECT * FROM watchlist WHERE type = ? ORDER BY created_at DESC')
      .all(type) as WatchlistEntry[];
  }
  return getDb()
    .prepare('SELECT * FROM watchlist ORDER BY created_at DESC')
    .all() as WatchlistEntry[];
}

/**
 * Records a command execution in the analysis history.
 */
export function addAnalysisHistory(
  command: string,
  input: string,
  result: string,
  chain: string,
): void {
  const now = Math.floor(Date.now() / 1000);
  getDb()
    .prepare(
      `INSERT INTO analysis_history (command, input, result, chain, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(command, input, result, chain, now);
}

/**
 * Returns the most recent analysis history entries.
 */
export function getAnalysisHistory(limit = 50): AnalysisHistoryEntry[] {
  return getDb()
    .prepare('SELECT * FROM analysis_history ORDER BY created_at DESC LIMIT ?')
    .all(limit) as AnalysisHistoryEntry[];
}
