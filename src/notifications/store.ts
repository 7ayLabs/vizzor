// ---------------------------------------------------------------------------
// Notification SQLite store — reuses getDb() from data/cache.ts
// ---------------------------------------------------------------------------

import { getDb } from '../data/cache.js';
import { createLogger } from '../utils/logger.js';
import type { Notification, AlertRule } from './types.js';

const log = createLogger('notifications:store');
let tableInitialized = false;

function ensureTables(): void {
  if (tableInitialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      symbol TEXT,
      metadata TEXT,
      read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_unread
      ON notifications (read, created_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_type
      ON notifications (type, created_at DESC)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      symbols TEXT,
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  tableInitialized = true;
  log.debug('Notification tables initialized');
}

// ---------------------------------------------------------------------------
// Notification CRUD
// ---------------------------------------------------------------------------

export function insertNotification(n: Notification): void {
  ensureTables();
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO notifications (id, type, title, message, severity, symbol, metadata, read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    n.id,
    n.type,
    n.title,
    n.message,
    n.severity,
    n.symbol ?? null,
    JSON.stringify(n.metadata),
    n.read ? 1 : 0,
    n.createdAt,
  );
}

export function getNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Notification[] {
  ensureTables();
  const db = getDb();
  const limit = opts?.limit ?? 50;
  const where = opts?.unreadOnly ? 'WHERE read = 0' : '';
  const rows = db
    .prepare(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as {
    id: string;
    type: string;
    title: string;
    message: string;
    severity: string;
    symbol: string | null;
    metadata: string;
    read: number;
    created_at: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    type: r.type as Notification['type'],
    title: r.title,
    message: r.message,
    severity: r.severity as Notification['severity'],
    symbol: r.symbol ?? undefined,
    metadata: JSON.parse(r.metadata || '{}') as Record<string, unknown>,
    read: r.read === 1,
    createdAt: r.created_at,
  }));
}

export function markRead(id: string): void {
  ensureTables();
  getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
}

export function markAllRead(): void {
  ensureTables();
  getDb().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
}

export function getUnreadCount(): number {
  ensureTables();
  const row = getDb().prepare('SELECT COUNT(*) as cnt FROM notifications WHERE read = 0').get() as {
    cnt: number;
  };
  return row.cnt;
}

// ---------------------------------------------------------------------------
// Alert rule CRUD
// ---------------------------------------------------------------------------

export function insertAlertRule(rule: AlertRule): void {
  ensureTables();
  const { id, type, enabled, symbols, createdAt, ...rest } = rule;
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO alert_rules (id, type, enabled, symbols, config, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      type,
      enabled ? 1 : 0,
      symbols ? JSON.stringify(symbols) : null,
      JSON.stringify(rest),
      createdAt,
    );
}

export function getAlertRules(): AlertRule[] {
  ensureTables();
  const rows = getDb().prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all() as {
    id: string;
    type: string;
    enabled: number;
    symbols: string | null;
    config: string;
    created_at: number;
  }[];

  return rows.map((r) => {
    const config = JSON.parse(r.config || '{}') as Record<string, unknown>;
    return {
      id: r.id,
      type: r.type as AlertRule['type'],
      enabled: r.enabled === 1,
      symbols: r.symbols ? (JSON.parse(r.symbols) as string[]) : undefined,
      priceAbove: config['priceAbove'] as number | undefined,
      priceBelow: config['priceBelow'] as number | undefined,
      pumpSeverity: config['pumpSeverity'] as AlertRule['pumpSeverity'],
      agentActions: config['agentActions'] as AlertRule['agentActions'],
      accuracyMilestone: config['accuracyMilestone'] as number | undefined,
      createdAt: r.created_at,
    };
  });
}

export function updateAlertRule(id: string, patch: Partial<AlertRule>): void {
  ensureTables();
  const rules = getAlertRules();
  const existing = rules.find((r) => r.id === id);
  if (!existing) return;

  const merged = { ...existing, ...patch };
  insertAlertRule(merged);
}

export function deleteAlertRule(id: string): void {
  ensureTables();
  getDb().prepare('DELETE FROM alert_rules WHERE id = ?').run(id);
}
