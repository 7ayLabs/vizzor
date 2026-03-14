// ---------------------------------------------------------------------------
// Audit logging — immutable security event trail
// ---------------------------------------------------------------------------

import { createLogger } from '../utils/logger.js';

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
  | 'kill_switch_triggered';

export interface AuditEvent {
  type: AuditEventType;
  actor: string; // API key prefix, user, or 'system'
  resource: string; // What was affected
  action: string; // Human-readable action
  metadata?: Record<string, unknown>;
  ip?: string;
  timestamp: number;
}

const eventLog: AuditEvent[] = [];
const MAX_MEMORY_EVENTS = 10_000;

export function logAuditEvent(event: Omit<AuditEvent, 'timestamp'>): void {
  const fullEvent: AuditEvent = {
    ...event,
    timestamp: Date.now(),
  };

  // In-memory buffer (capped)
  if (eventLog.length >= MAX_MEMORY_EVENTS) {
    eventLog.shift();
  }
  eventLog.push(fullEvent);

  // Also log to structured logger for persistence
  log.info(
    `[AUDIT] ${event.type}: ${event.action} | actor=${event.actor} resource=${event.resource}`,
  );
}

export function getRecentAuditEvents(limit = 100, type?: AuditEventType): AuditEvent[] {
  let filtered = eventLog;
  if (type) {
    filtered = eventLog.filter((e) => e.type === type);
  }
  return filtered.slice(-limit);
}

export function getAuditStats(): {
  totalEvents: number;
  byType: Record<string, number>;
  recentFailures: number;
} {
  const byType: Record<string, number> = {};
  let recentFailures = 0;
  const fiveMinAgo = Date.now() - 300_000;

  for (const event of eventLog) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    if (event.type === 'auth_failure' && event.timestamp > fiveMinAgo) {
      recentFailures++;
    }
  }

  return {
    totalEvents: eventLog.length,
    byType,
    recentFailures,
  };
}
