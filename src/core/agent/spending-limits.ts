// ---------------------------------------------------------------------------
// Spending limits — per-agent caps with rolling windows
// ---------------------------------------------------------------------------

import { getDb } from '../../data/cache.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('spending-limits');

export interface SpendingLimit {
  agentId: string;
  maxDailyUsd: number;
  maxPerTradeUsd: number;
  maxWeeklyUsd: number;
  maxPositionValueUsd: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function ensureSpendingTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS agent_spending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      action TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);
}

export class SpendingLimitsEnforcer {
  private limits: SpendingLimit;

  constructor(limits: SpendingLimit) {
    this.limits = limits;
    ensureSpendingTable();
    log.info(
      `Spending limits initialized for agent ${limits.agentId}: ` +
        `daily=$${limits.maxDailyUsd} per-trade=$${limits.maxPerTradeUsd} ` +
        `weekly=$${limits.maxWeeklyUsd} max-position=$${limits.maxPositionValueUsd}`,
    );
  }

  canSpend(agentId: string, amountUsd: number): { allowed: boolean; reason?: string } {
    // 1. Per-trade limit
    if (amountUsd > this.limits.maxPerTradeUsd) {
      const reason = `Per-trade limit exceeded: $${amountUsd.toFixed(2)} > $${this.limits.maxPerTradeUsd.toFixed(2)}`;
      log.warn(reason);
      return { allowed: false, reason };
    }

    // 2. Rolling 24h daily limit
    const dailySpent = this.getSpentToday(agentId);
    if (dailySpent + amountUsd > this.limits.maxDailyUsd) {
      const reason =
        `Daily limit would be exceeded: spent=$${dailySpent.toFixed(2)} + ` +
        `$${amountUsd.toFixed(2)} > $${this.limits.maxDailyUsd.toFixed(2)}`;
      log.warn(reason);
      return { allowed: false, reason };
    }

    // 3. Rolling 7d weekly limit
    const weeklySpent = this.getSpentThisWeek(agentId);
    if (weeklySpent + amountUsd > this.limits.maxWeeklyUsd) {
      const reason =
        `Weekly limit would be exceeded: spent=$${weeklySpent.toFixed(2)} + ` +
        `$${amountUsd.toFixed(2)} > $${this.limits.maxWeeklyUsd.toFixed(2)}`;
      log.warn(reason);
      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  recordSpend(agentId: string, amountUsd: number, action: string): void {
    ensureSpendingTable();

    getDb()
      .prepare(
        `INSERT INTO agent_spending (agent_id, amount_usd, action, timestamp) VALUES (?, ?, ?, ?)`,
      )
      .run(agentId, amountUsd, action, Date.now());

    log.info(`Recorded spend for agent ${agentId}: $${amountUsd.toFixed(2)} (${action})`);
  }

  getSpentToday(agentId: string): number {
    ensureSpendingTable();

    const cutoff = Date.now() - MS_PER_DAY;
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(amount_usd), 0) as total
         FROM agent_spending
         WHERE agent_id = ? AND timestamp >= ?`,
      )
      .get(agentId, cutoff) as { total: number } | undefined;

    return row?.total ?? 0;
  }

  getSpentThisWeek(agentId: string): number {
    ensureSpendingTable();

    const cutoff = Date.now() - MS_PER_WEEK;
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(amount_usd), 0) as total
         FROM agent_spending
         WHERE agent_id = ? AND timestamp >= ?`,
      )
      .get(agentId, cutoff) as { total: number } | undefined;

    return row?.total ?? 0;
  }

  resetLimits(agentId: string): void {
    ensureSpendingTable();

    const result = getDb().prepare(`DELETE FROM agent_spending WHERE agent_id = ?`).run(agentId);

    log.info(`Reset spending history for agent ${agentId}: ${result.changes} records removed`);
  }
}
