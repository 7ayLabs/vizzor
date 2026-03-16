// ---------------------------------------------------------------------------
// MigrationTracker — bonding curve progress monitor for Solana launchpad tokens
// Tracks tokens through bonding → migrating → dex_listed phases
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';
import { getDb } from '../../data/cache.js';

const log = createLogger('migration-tracker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationStatus {
  mint: string;
  name: string;
  symbol: string;
  bondingProgress: number; // 0-100
  timeToMigration: number | null; // estimated seconds
  velocity: number; // progress per minute
  marketCap: number;
  phase: 'bonding' | 'migrating' | 'dex_listed' | 'failed';
  trackedSince: number;
  lastUpdate: number;
}

type MigrationPhase = MigrationStatus['phase'];

// ---------------------------------------------------------------------------
// DB initialization
// ---------------------------------------------------------------------------

let tableInitialized = false;

function ensureTable(): void {
  if (tableInitialized) return;

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_tracking (
      mint TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      symbol TEXT NOT NULL DEFAULT '',
      bonding_progress REAL NOT NULL DEFAULT 0,
      velocity REAL NOT NULL DEFAULT 0,
      market_cap REAL NOT NULL DEFAULT 0,
      phase TEXT NOT NULL DEFAULT 'bonding',
      tracked_since INTEGER NOT NULL,
      last_update INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_migration_phase ON migration_tracking (phase);
  `);

  tableInitialized = true;
}

// ---------------------------------------------------------------------------
// MigrationTracker
// ---------------------------------------------------------------------------

export class MigrationTracker {
  constructor() {
    ensureTable();
  }

  /**
   * Start tracking a token or update it if already tracked.
   * Calculates velocity from previous progress reading.
   */
  trackToken(
    mint: string,
    name: string,
    symbol: string,
    progress: number,
    marketCap: number,
  ): void {
    const db = getDb();
    const now = Date.now();
    const clampedProgress = Math.max(0, Math.min(100, progress));

    // Check for existing record
    const existing = this.getRow(mint);

    if (existing) {
      // Calculate velocity: progress change per minute
      const elapsed = (now - existing.last_update) / 60000; // ms → minutes
      const progressDelta = clampedProgress - existing.bonding_progress;
      const velocity = elapsed > 0 ? progressDelta / elapsed : 0;

      const phase = this.determinePhase(clampedProgress, existing.phase as MigrationPhase);

      db.prepare(
        `UPDATE migration_tracking
         SET name = ?, symbol = ?, bonding_progress = ?, velocity = ?,
             market_cap = ?, phase = ?, last_update = ?
         WHERE mint = ?`,
      ).run(name, symbol, clampedProgress, velocity, marketCap, phase, now, mint);

      log.debug(
        `Updated tracking for ${symbol} (${mint}): ${clampedProgress}% @ ${velocity.toFixed(2)}/min → ${phase}`,
      );
    } else {
      const phase = clampedProgress >= 100 ? 'migrating' : 'bonding';

      db.prepare(
        `INSERT INTO migration_tracking
         (mint, name, symbol, bonding_progress, velocity, market_cap, phase, tracked_since, last_update)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(mint, name, symbol, clampedProgress, 0, marketCap, phase, now, now);

      log.info(`Now tracking ${symbol} (${mint}): ${clampedProgress}% [${phase}]`);
    }
  }

  /**
   * Update bonding progress and recalculate velocity.
   * If progress >= 100, transitions to 'migrating' phase.
   */
  updateProgress(mint: string, progress: number, marketCap: number): void {
    const db = getDb();
    const now = Date.now();
    const clampedProgress = Math.max(0, Math.min(100, progress));

    const existing = this.getRow(mint);
    if (!existing) {
      log.warn(`Cannot update progress for untracked token: ${mint}`);
      return;
    }

    // Calculate velocity: progress change per minute
    const elapsed = (now - existing.last_update) / 60000;
    const progressDelta = clampedProgress - existing.bonding_progress;
    const velocity = elapsed > 0 ? progressDelta / elapsed : existing.velocity;

    const phase = this.determinePhase(clampedProgress, existing.phase as MigrationPhase);

    db.prepare(
      `UPDATE migration_tracking
       SET bonding_progress = ?, velocity = ?, market_cap = ?, phase = ?, last_update = ?
       WHERE mint = ?`,
    ).run(clampedProgress, velocity, marketCap, phase, now, mint);

    if (phase !== existing.phase) {
      log.info(`Phase change for ${existing.symbol} (${mint}): ${existing.phase} → ${phase}`);
    }
  }

  /**
   * Get all tokens currently in bonding or migrating phase.
   */
  getActiveTracking(): MigrationStatus[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM migration_tracking
         WHERE phase IN ('bonding', 'migrating')
         ORDER BY bonding_progress DESC`,
      )
      .all() as MigrationRow[];

    return rows.map((row) => this.rowToStatus(row));
  }

  /**
   * Get the status of a specific token.
   */
  getStatus(mint: string): MigrationStatus | null {
    const row = this.getRow(mint);
    if (!row) return null;
    return this.rowToStatus(row);
  }

  /**
   * Estimate seconds until migration based on current velocity.
   * Returns null if velocity is zero or negative (not progressing).
   */
  estimateTimeToMigration(mint: string): number | null {
    const row = this.getRow(mint);
    if (!row) return null;

    if (row.bonding_progress >= 100) return 0;
    if (row.velocity <= 0) return null;

    const remainingProgress = 100 - row.bonding_progress;
    const minutesRemaining = remainingProgress / row.velocity;

    return Math.round(minutesRemaining * 60); // Convert to seconds
  }

  /**
   * Remove completed/failed entries older than the given age.
   * Returns the number of rows removed.
   */
  pruneCompleted(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const db = getDb();
    const cutoff = Date.now() - maxAgeMs;

    const result = db
      .prepare(
        `DELETE FROM migration_tracking
         WHERE phase IN ('dex_listed', 'failed')
         AND last_update < ?`,
      )
      .run(cutoff);

    const pruned = result.changes;
    if (pruned > 0) {
      log.info(`Pruned ${pruned} completed/failed migration entries`);
    }

    return pruned;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private getRow(mint: string): MigrationRow | undefined {
    const db = getDb();
    return db.prepare('SELECT * FROM migration_tracking WHERE mint = ?').get(mint) as
      | MigrationRow
      | undefined;
  }

  private determinePhase(progress: number, currentPhase: MigrationPhase): MigrationPhase {
    // Once dex_listed or failed, don't revert
    if (currentPhase === 'dex_listed' || currentPhase === 'failed') {
      return currentPhase;
    }

    if (progress >= 100) {
      return currentPhase === 'migrating' ? 'migrating' : 'migrating';
    }

    return 'bonding';
  }

  private rowToStatus(row: MigrationRow): MigrationStatus {
    const timeToMigration = this.estimateTimeFromRow(row);

    return {
      mint: row.mint,
      name: row.name,
      symbol: row.symbol,
      bondingProgress: row.bonding_progress,
      timeToMigration,
      velocity: row.velocity,
      marketCap: row.market_cap,
      phase: row.phase as MigrationPhase,
      trackedSince: row.tracked_since,
      lastUpdate: row.last_update,
    };
  }

  private estimateTimeFromRow(row: MigrationRow): number | null {
    if (row.bonding_progress >= 100) return 0;
    if (row.velocity <= 0) return null;

    const remainingProgress = 100 - row.bonding_progress;
    const minutesRemaining = remainingProgress / row.velocity;

    return Math.round(minutesRemaining * 60);
  }
}

// ---------------------------------------------------------------------------
// DB row type
// ---------------------------------------------------------------------------

interface MigrationRow {
  mint: string;
  name: string;
  symbol: string;
  bonding_progress: number;
  velocity: number;
  market_cap: number;
  phase: string;
  tracked_since: number;
  last_update: number;
}
