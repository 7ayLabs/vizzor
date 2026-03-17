// ---------------------------------------------------------------------------
// Notification system types
// ---------------------------------------------------------------------------

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type NotificationEventType =
  | 'prediction_resolved'
  | 'prediction_accuracy_milestone'
  | 'price_threshold'
  | 'pump_detected'
  | 'agent_decision'
  | 'balance_low'
  | 'migration_detected'
  | 'smart_money_signal'
  | 'risk_event'
  | 'custom';

export interface Notification {
  id: string;
  type: NotificationEventType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  symbol?: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

export interface AlertRule {
  id: string;
  type: NotificationEventType;
  enabled: boolean;
  symbols?: string[];
  priceAbove?: number;
  priceBelow?: number;
  pumpSeverity?: ('low' | 'medium' | 'high' | 'critical')[];
  agentActions?: ('buy' | 'sell')[];
  accuracyMilestone?: number;
  createdAt: number;
}

export interface NotificationChannels {
  desktop: boolean;
  tui: boolean;
  websocket: boolean;
  n8n: boolean;
}

export interface NotificationConfig {
  desktop: boolean;
  websocket: boolean;
  n8n: boolean;
  toastDismissMs: number;
  pollIntervalMs: number;
  cooldownMs: number;
  maxToastStack: number;
}
