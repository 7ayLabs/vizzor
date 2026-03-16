// ---------------------------------------------------------------------------
// Audit logging — immutable security event trail with SQLite persistence
// ---------------------------------------------------------------------------

import { createLogger } from '../utils/logger.js';
import { getDb } from '../data/cache.js';

const log = createLogger('audit');

export type AuditEventType =
  | 'api_key_created'
  | 'api_key_revoked'
  | 'api_request'
  | 'auth_failure'
  | 'agent_started'
  | 'agent_stopped'
  | 'config_changed'
  | 'rate_limit_exceeded'
  | 'anomaly_detected'
  | 'kill_switch_triggered'
  | 'trade_executed'
  | 'wallet_created'
  | 'wallet_rotated'
  | 'emergency_stop';

export interface AuditEvent {
  type: AuditEventType;
  actor: string; // API key prefix, user, or 'system'
  resource: string; // What was affected
  action: string; // Human-readable action
  metadata?: Record<string, unknown>;
  ip?: string;
  timestamp: number;
}

// In-memory buffer for fast access to recent events (last 100)
const memoryBuffer: AuditEvent[] = [];
const MAX_MEMORY_BUFFER = 100;

/**
 * Ensure the audit_events table exists in SQLite.
 */
export function ensureAuditTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      actor TEXT NOT NULL,
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      metadata TEXT,
      ip TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
}

/**
 * Log an audit event to SQLite and keep in memory buffer.
 */
export function logAuditEvent(event: Omit<AuditEvent, 'timestamp'>): void {
  const fullEvent: AuditEvent = {
    ...event,
    timestamp: Date.now(),
  };

  // Persist to SQLite
  try {
    ensureAuditTable();
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_events (type, actor, resource, action, metadata, ip, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      fullEvent.type,
      fullEvent.actor,
      fullEvent.resource,
      fullEvent.action,
      fullEvent.metadata ? JSON.stringify(fullEvent.metadata) : null,
      fullEvent.ip ?? null,
      fullEvent.timestamp,
    );
  } catch (err: unknown) {
    // Log failure but don't throw — audit should not break callers
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to persist audit event to SQLite: ${message}`);
  }

  // In-memory buffer (capped at last 100)
  if (memoryBuffer.length >= MAX_MEMORY_BUFFER) {
    memoryBuffer.shift();
  }
  memoryBuffer.push(fullEvent);

  // Also log to structured logger for file-based persistence
  // Redact actor field to prevent sensitive data leaking into logs
  const safeActor = event.actor.length > 16 ? event.actor.slice(0, 8) + '***' : event.actor;
  log.info(
    `[AUDIT] ${event.type}: ${event.action} | actor=${safeActor} resource=${event.resource}`,
  );
}

/**
 * Get recent audit events from SQLite, with optional type filter.
 */
export function getRecentAuditEvents(limit = 100, type?: AuditEventType): AuditEvent[] {
  try {
    ensureAuditTable();
    const db = getDb();

    let rows: {
      type: string;
      actor: string;
      resource: string;
      action: string;
      metadata: string | null;
      ip: string | null;
      timestamp: number;
    }[];

    if (type) {
      rows = db
        .prepare(
          'SELECT type, actor, resource, action, metadata, ip, timestamp FROM audit_events WHERE type = ? ORDER BY timestamp DESC LIMIT ?',
        )
        .all(type, limit) as typeof rows;
    } else {
      rows = db
        .prepare(
          'SELECT type, actor, resource, action, metadata, ip, timestamp FROM audit_events ORDER BY timestamp DESC LIMIT ?',
        )
        .all(limit) as typeof rows;
    }

    return rows.map((r) => ({
      type: r.type as AuditEventType,
      actor: r.actor,
      resource: r.resource,
      action: r.action,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : undefined,
      ip: r.ip ?? undefined,
      timestamp: r.timestamp,
    }));
  } catch {
    // Fallback to memory buffer if SQLite is unavailable
    let filtered: AuditEvent[] = memoryBuffer;
    if (type) {
      filtered = memoryBuffer.filter((e) => e.type === type);
    }
    return filtered.slice(-limit);
  }
}

/**
 * Get audit events within a date range (timestamps in milliseconds).
 */
export function getAuditEventsByDateRange(from: number, to: number): AuditEvent[] {
  try {
    ensureAuditTable();
    const db = getDb();

    const rows = db
      .prepare(
        'SELECT type, actor, resource, action, metadata, ip, timestamp FROM audit_events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC',
      )
      .all(from, to) as {
      type: string;
      actor: string;
      resource: string;
      action: string;
      metadata: string | null;
      ip: string | null;
      timestamp: number;
    }[];

    return rows.map((r) => ({
      type: r.type as AuditEventType,
      actor: r.actor,
      resource: r.resource,
      action: r.action,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : undefined,
      ip: r.ip ?? undefined,
      timestamp: r.timestamp,
    }));
  } catch {
    // Fallback to memory buffer filtered by date range
    return memoryBuffer.filter((e) => e.timestamp >= from && e.timestamp <= to);
  }
}

/**
 * Get audit statistics from SQLite.
 */
export function getAuditStats(): {
  totalEvents: number;
  byType: Record<string, number>;
  recentFailures: number;
} {
  try {
    ensureAuditTable();
    const db = getDb();

    // Total count
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM audit_events').get() as {
      count: number;
    };

    // Count by type
    const typeRows = db
      .prepare('SELECT type, COUNT(*) as count FROM audit_events GROUP BY type')
      .all() as { type: string; count: number }[];

    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    // Recent auth failures (last 5 minutes)
    const fiveMinAgo = Date.now() - 300_000;
    const failRow = db
      .prepare(
        "SELECT COUNT(*) as count FROM audit_events WHERE type = 'auth_failure' AND timestamp > ?",
      )
      .get(fiveMinAgo) as { count: number };

    return {
      totalEvents: totalRow.count,
      byType,
      recentFailures: failRow.count,
    };
  } catch {
    // Fallback to memory buffer stats
    const byType: Record<string, number> = {};
    let recentFailures = 0;
    const fiveMinAgo = Date.now() - 300_000;

    for (const event of memoryBuffer) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      if (event.type === 'auth_failure' && event.timestamp > fiveMinAgo) {
        recentFailures++;
      }
    }

    return {
      totalEvents: memoryBuffer.length,
      byType,
      recentFailures,
    };
  }
}
