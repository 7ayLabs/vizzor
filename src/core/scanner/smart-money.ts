// ---------------------------------------------------------------------------
// SmartMoneyTracker — wallet clustering + whale correlation for creator reputation
// Tracks creator history, detects smart money signals, and clusters related wallets
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';
import { getDb } from '../../data/cache.js';

const log = createLogger('smart-money');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreatorReputation {
  address: string;
  totalProjects: number;
  successfulProjects: number; // survived > 7 days
  ruggedProjects: number;
  avgLifespanDays: number;
  reputationScore: number; // 0-100
  lastProjectAt: number;
  walletCluster: string[]; // related wallets
}

export interface SmartMoneySignal {
  type: 'whale_buy' | 'whale_sell' | 'smart_money_accumulation' | 'insider_activity';
  wallet: string;
  token: string;
  amount: number;
  confidence: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// DB initialization
// ---------------------------------------------------------------------------

let tableInitialized = false;

function ensureTable(): void {
  if (tableInitialized) return;

  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_reputation (
      address TEXT PRIMARY KEY,
      total_projects INTEGER DEFAULT 0,
      successful_projects INTEGER DEFAULT 0,
      rugged_projects INTEGER DEFAULT 0,
      avg_lifespan_days REAL DEFAULT 0,
      reputation_score REAL DEFAULT 50,
      last_project_at INTEGER,
      wallet_cluster TEXT DEFAULT '[]'
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_reputation_score
    ON creator_reputation (reputation_score DESC);
  `);

  tableInitialized = true;
}

// ---------------------------------------------------------------------------
// Known whale / smart money wallets (curated list)
// In production these would be loaded from a data source or config
// ---------------------------------------------------------------------------

const KNOWN_WHALE_WALLETS = new Set<string>([
  // Placeholder well-known wallets — in production, populated from DB or external source
]);

const KNOWN_SMART_MONEY_WALLETS = new Set<string>([
  // Placeholder known early adopters / VCs
]);

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

const BASE_SCORE = 50;
const SUCCESS_BONUS = 10;
const RUG_PENALTY = 20;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

// ---------------------------------------------------------------------------
// SmartMoneyTracker
// ---------------------------------------------------------------------------

export class SmartMoneyTracker {
  constructor() {
    ensureTable();
  }

  /**
   * Get the reputation profile for a creator address.
   * Checks SQLite cache first; returns default profile if not found.
   */
  async getCreatorReputation(address: string): Promise<CreatorReputation> {
    const normalizedAddress = address.toLowerCase();

    // Check cache
    const cached = this.getReputationFromDb(normalizedAddress);
    if (cached) {
      return cached;
    }

    // Create default reputation for unknown creators
    const defaultReputation: CreatorReputation = {
      address: normalizedAddress,
      totalProjects: 0,
      successfulProjects: 0,
      ruggedProjects: 0,
      avgLifespanDays: 0,
      reputationScore: BASE_SCORE,
      lastProjectAt: 0,
      walletCluster: [],
    };

    // Insert the default into DB for future lookups
    this.upsertReputation(defaultReputation);

    return defaultReputation;
  }

  /**
   * Update a creator's reputation based on project outcome.
   */
  updateReputation(address: string, outcome: 'success' | 'rug' | 'neutral'): void {
    const normalizedAddress = address.toLowerCase();
    const db = getDb();
    const now = Date.now();

    const existing = this.getReputationFromDb(normalizedAddress);

    if (!existing) {
      // Create new entry
      const newRep: CreatorReputation = {
        address: normalizedAddress,
        totalProjects: 1,
        successfulProjects: outcome === 'success' ? 1 : 0,
        ruggedProjects: outcome === 'rug' ? 1 : 0,
        avgLifespanDays: outcome === 'success' ? 7 : outcome === 'rug' ? 1 : 3,
        reputationScore: this.calculateScore(
          outcome === 'success' ? 1 : 0,
          outcome === 'rug' ? 1 : 0,
        ),
        lastProjectAt: now,
        walletCluster: [],
      };
      this.upsertReputation(newRep);
      log.info(`New creator tracked: ${normalizedAddress} [${outcome}]`);
      return;
    }

    // Update existing
    const totalProjects = existing.totalProjects + 1;
    const successfulProjects = existing.successfulProjects + (outcome === 'success' ? 1 : 0);
    const ruggedProjects = existing.ruggedProjects + (outcome === 'rug' ? 1 : 0);

    // Weighted average lifespan
    const newLifespan = outcome === 'success' ? 14 : outcome === 'rug' ? 0.5 : 3;
    const avgLifespanDays =
      (existing.avgLifespanDays * existing.totalProjects + newLifespan) / totalProjects;

    const reputationScore = this.calculateScore(successfulProjects, ruggedProjects);

    db.prepare(
      `UPDATE creator_reputation
       SET total_projects = ?, successful_projects = ?, rugged_projects = ?,
           avg_lifespan_days = ?, reputation_score = ?, last_project_at = ?
       WHERE address = ?`,
    ).run(
      totalProjects,
      successfulProjects,
      ruggedProjects,
      avgLifespanDays,
      reputationScore,
      now,
      normalizedAddress,
    );

    log.info(`Updated reputation for ${normalizedAddress}: score=${reputationScore} [${outcome}]`);
  }

  /**
   * Detect smart money signals for a specific token.
   * Looks for known whale wallets buying/selling and cluster activity.
   */
  async detectSmartMoney(token: string, _chain: string): Promise<SmartMoneySignal[]> {
    const signals: SmartMoneySignal[] = [];
    const now = Date.now();

    // In a production system, this would:
    // 1. Query on-chain transfer events for the token
    // 2. Cross-reference with known whale/smart money wallets
    // 3. Detect cluster activity (multiple related wallets buying)
    //
    // For now, we check our cluster DB for any known associations

    try {
      const db = getDb();
      const clusters = db
        .prepare(
          `SELECT address, wallet_cluster, reputation_score
           FROM creator_reputation
           WHERE wallet_cluster != '[]'
           ORDER BY reputation_score DESC
           LIMIT 100`,
        )
        .all() as {
        address: string;
        wallet_cluster: string;
        reputation_score: number;
      }[];

      // Check if any tracked wallets or their clusters are known whales
      for (const row of clusters) {
        const clusterWallets = this.parseCluster(row.wallet_cluster);
        const allWallets = [row.address, ...clusterWallets];

        for (const wallet of allWallets) {
          if (KNOWN_WHALE_WALLETS.has(wallet)) {
            signals.push({
              type: 'whale_buy',
              wallet,
              token,
              amount: 0, // Would be populated from on-chain data
              confidence: 0.7,
              timestamp: now,
            });
          }

          if (KNOWN_SMART_MONEY_WALLETS.has(wallet)) {
            signals.push({
              type: 'smart_money_accumulation',
              wallet,
              token,
              amount: 0,
              confidence: 0.8,
              timestamp: now,
            });
          }
        }

        // Detect cluster activity: if multiple wallets in the same cluster
        // are interacting with the same token, flag as insider activity
        if (clusterWallets.length >= 3) {
          signals.push({
            type: 'insider_activity',
            wallet: row.address,
            token,
            amount: 0,
            confidence: 0.5 + Math.min(0.4, clusterWallets.length * 0.05),
            timestamp: now,
          });
        }
      }
    } catch (err) {
      log.error(
        `Smart money detection failed for ${token}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return signals;
  }

  /**
   * Get top creators sorted by reputation score.
   */
  getTopCreators(limit = 20): CreatorReputation[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM creator_reputation
         ORDER BY reputation_score DESC
         LIMIT ?`,
      )
      .all(limit) as CreatorReputationRow[];

    return rows.map((row) => this.rowToReputation(row));
  }

  /**
   * Add related addresses to a creator's wallet cluster.
   * Merges with existing cluster, deduplicating addresses.
   */
  addToCluster(address: string, relatedAddresses: string[]): void {
    const normalizedAddress = address.toLowerCase();
    const normalizedRelated = relatedAddresses.map((a) => a.toLowerCase());

    const existing = this.getReputationFromDb(normalizedAddress);

    if (!existing) {
      // Create entry with cluster
      const newRep: CreatorReputation = {
        address: normalizedAddress,
        totalProjects: 0,
        successfulProjects: 0,
        ruggedProjects: 0,
        avgLifespanDays: 0,
        reputationScore: BASE_SCORE,
        lastProjectAt: 0,
        walletCluster: normalizedRelated,
      };
      this.upsertReputation(newRep);
      log.info(
        `Created cluster for ${normalizedAddress} with ${normalizedRelated.length} related wallets`,
      );
      return;
    }

    // Merge clusters, deduplicate
    const currentCluster = new Set(existing.walletCluster);
    for (const addr of normalizedRelated) {
      if (addr !== normalizedAddress) {
        currentCluster.add(addr);
      }
    }

    const mergedCluster = Array.from(currentCluster);
    const db = getDb();
    db.prepare('UPDATE creator_reputation SET wallet_cluster = ? WHERE address = ?').run(
      JSON.stringify(mergedCluster),
      normalizedAddress,
    );

    log.info(`Updated cluster for ${normalizedAddress}: ${mergedCluster.length} related wallets`);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private calculateScore(successCount: number, rugCount: number): number {
    const raw = BASE_SCORE + successCount * SUCCESS_BONUS - rugCount * RUG_PENALTY;
    return Math.max(MIN_SCORE, Math.min(MAX_SCORE, raw));
  }

  private getReputationFromDb(address: string): CreatorReputation | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM creator_reputation WHERE address = ?').get(address) as
      | CreatorReputationRow
      | undefined;

    if (!row) return null;
    return this.rowToReputation(row);
  }

  private upsertReputation(rep: CreatorReputation): void {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO creator_reputation
       (address, total_projects, successful_projects, rugged_projects,
        avg_lifespan_days, reputation_score, last_project_at, wallet_cluster)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      rep.address,
      rep.totalProjects,
      rep.successfulProjects,
      rep.ruggedProjects,
      rep.avgLifespanDays,
      rep.reputationScore,
      rep.lastProjectAt,
      JSON.stringify(rep.walletCluster),
    );
  }

  private rowToReputation(row: CreatorReputationRow): CreatorReputation {
    return {
      address: row.address,
      totalProjects: row.total_projects,
      successfulProjects: row.successful_projects,
      ruggedProjects: row.rugged_projects,
      avgLifespanDays: row.avg_lifespan_days,
      reputationScore: row.reputation_score,
      lastProjectAt: row.last_project_at ?? 0,
      walletCluster: this.parseCluster(row.wallet_cluster),
    };
  }

  private parseCluster(raw: string): string[] {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
      return [];
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// DB row type
// ---------------------------------------------------------------------------

interface CreatorReputationRow {
  address: string;
  total_projects: number;
  successful_projects: number;
  rugged_projects: number;
  avg_lifespan_days: number;
  reputation_score: number;
  last_project_at: number | null;
  wallet_cluster: string;
}
