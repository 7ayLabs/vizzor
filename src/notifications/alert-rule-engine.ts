// ---------------------------------------------------------------------------
// Alert rule engine — filters notifications against user-configured rules
// ---------------------------------------------------------------------------

import { getAlertRules } from './store.js';
import type { NotificationPayload } from './event-bus.js';
import type { AlertRule } from './types.js';

/**
 * Determine whether a notification should be delivered based on alert rules.
 * Default: deliver if no rules exist for this event type (allow-by-default).
 */
export function shouldDeliver(payload: NotificationPayload): boolean {
  const rules = getAlertRules().filter((r) => r.enabled && r.type === payload.type);

  // No rules for this type → deliver by default
  if (rules.length === 0) return true;

  // Any matching rule passes → deliver
  return rules.some((rule) => matchesRule(rule, payload));
}

function matchesRule(rule: AlertRule, payload: NotificationPayload): boolean {
  // Symbol filter
  if (rule.symbols && rule.symbols.length > 0 && payload.symbol) {
    if (!rule.symbols.includes(payload.symbol.toUpperCase())) return false;
  }

  // Type-specific threshold checks
  if (rule.type === 'price_threshold') {
    const price = (payload.metadata['price'] as number | undefined) ?? 0;
    if (rule.priceAbove !== undefined && price < rule.priceAbove) return false;
    if (rule.priceBelow !== undefined && price > rule.priceBelow) return false;
  }

  if (rule.type === 'pump_detected' && rule.pumpSeverity) {
    const sev = payload.metadata['severity'] as string | undefined;
    if (!sev || !rule.pumpSeverity.includes(sev as 'low' | 'medium' | 'high' | 'critical')) {
      return false;
    }
  }

  if (rule.type === 'agent_decision' && rule.agentActions) {
    const action = payload.metadata['action'] as string | undefined;
    if (!action || !rule.agentActions.includes(action as 'buy' | 'sell')) {
      return false;
    }
  }

  if (rule.type === 'prediction_accuracy_milestone' && rule.accuracyMilestone) {
    const milestone = payload.metadata['milestone'] as number | undefined;
    if (milestone !== undefined && milestone < rule.accuracyMilestone) return false;
  }

  return true;
}
