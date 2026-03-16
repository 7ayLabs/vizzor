// ---------------------------------------------------------------------------
// Approval manager — ERC-20 approval tracking, exact amounts, auto-revoke
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';
import { getDb } from '../../data/cache.js';

const log = createLogger('approval-manager');

export interface TokenApproval {
  token: string;
  spender: string;
  amount: bigint;
  chain: string;
  agentId: string;
  grantedAt: number;
  expiresAt: number | null;
}

interface ApprovalRow {
  id: number;
  token: string;
  spender: string;
  amount: string;
  chain: string;
  agent_id: string;
  granted_at: number;
  revoked_at: number | null;
}

function ensureApprovalTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS token_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      spender TEXT NOT NULL,
      amount TEXT NOT NULL,
      chain TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      revoked_at INTEGER
    )
  `);
}

export class ApprovalManager {
  constructor() {
    ensureApprovalTable();
    log.info('Approval manager initialized');
  }

  grantApproval(approval: Omit<TokenApproval, 'grantedAt'>): void {
    ensureApprovalTable();

    const now = Date.now();

    // Revoke any existing approval for the same token+spender+agent combo
    getDb()
      .prepare(
        `UPDATE token_approvals SET revoked_at = ?
         WHERE token = ? AND spender = ? AND agent_id = ? AND revoked_at IS NULL`,
      )
      .run(now, approval.token, approval.spender, approval.agentId);

    getDb()
      .prepare(
        `INSERT INTO token_approvals (token, spender, amount, chain, agent_id, granted_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        approval.token,
        approval.spender,
        approval.amount.toString(),
        approval.chain,
        approval.agentId,
        now,
      );

    log.info(
      `Granted approval: ${approval.token} → ${approval.spender} ` +
        `amount=${approval.amount} chain=${approval.chain} agent=${approval.agentId}`,
    );
  }

  revokeApproval(token: string, spender: string, agentId: string): void {
    ensureApprovalTable();

    const result = getDb()
      .prepare(
        `UPDATE token_approvals SET revoked_at = ?
         WHERE token = ? AND spender = ? AND agent_id = ? AND revoked_at IS NULL`,
      )
      .run(Date.now(), token, spender, agentId);

    if (result.changes > 0) {
      log.info(`Revoked approval: ${token} → ${spender} for agent ${agentId}`);
    } else {
      log.warn(`No active approval found to revoke: ${token} → ${spender} for agent ${agentId}`);
    }
  }

  getActiveApprovals(agentId: string): TokenApproval[] {
    ensureApprovalTable();

    const rows = getDb()
      .prepare(`SELECT * FROM token_approvals WHERE agent_id = ? AND revoked_at IS NULL`)
      .all(agentId) as ApprovalRow[];

    return rows.map((r) => ({
      token: r.token,
      spender: r.spender,
      amount: BigInt(r.amount),
      chain: r.chain,
      agentId: r.agent_id,
      grantedAt: r.granted_at,
      expiresAt: null,
    }));
  }

  hasApproval(token: string, spender: string, agentId: string, requiredAmount: bigint): boolean {
    ensureApprovalTable();

    const row = getDb()
      .prepare(
        `SELECT amount FROM token_approvals
         WHERE token = ? AND spender = ? AND agent_id = ? AND revoked_at IS NULL
         ORDER BY granted_at DESC LIMIT 1`,
      )
      .get(token, spender, agentId) as { amount: string } | undefined;

    if (!row) return false;

    const approvedAmount = BigInt(row.amount);
    return approvedAmount >= requiredAmount;
  }

  revokeAllForAgent(agentId: string): number {
    ensureApprovalTable();

    const result = getDb()
      .prepare(
        `UPDATE token_approvals SET revoked_at = ? WHERE agent_id = ? AND revoked_at IS NULL`,
      )
      .run(Date.now(), agentId);

    log.info(`Revoked all approvals for agent ${agentId}: ${result.changes} approvals`);
    return result.changes;
  }

  getStaleApprovals(maxAgeMs: number): TokenApproval[] {
    ensureApprovalTable();

    const cutoff = Date.now() - maxAgeMs;

    const rows = getDb()
      .prepare(`SELECT * FROM token_approvals WHERE revoked_at IS NULL AND granted_at < ?`)
      .all(cutoff) as ApprovalRow[];

    return rows.map((r) => ({
      token: r.token,
      spender: r.spender,
      amount: BigInt(r.amount),
      chain: r.chain,
      agentId: r.agent_id,
      grantedAt: r.granted_at,
      expiresAt: null,
    }));
  }
}
