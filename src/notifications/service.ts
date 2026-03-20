// ---------------------------------------------------------------------------
// Notification service — central dispatcher (hub)
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { createLogger } from '../utils/logger.js';
import { onNotification } from './event-bus.js';
import type { NotificationPayload } from './event-bus.js';
import { shouldDeliver } from './alert-rule-engine.js';
import { insertNotification, insertAlertRule, getAlertRules } from './store.js';
import type { Notification, NotificationChannels, NotificationConfig } from './types.js';

const log = createLogger('notifications');

/** Configurable settings — populated from config.yaml on init. */
let config: NotificationConfig = {
  desktop: true,
  websocket: true,
  n8n: false,
  toastDismissMs: 5000,
  pollIntervalMs: 30000,
  cooldownMs: 300000,
  maxToastStack: 3,
};

let channels: NotificationChannels = {
  desktop: true,
  tui: false,
  websocket: true,
  n8n: false,
};

// Cooldown tracking: key = `${type}:${symbol}` → last emit timestamp
const cooldownMap = new Map<string, number>();

// TUI callback — registered by the TUI when it mounts
let tuiCallback: ((n: Notification) => void) | null = null;

export function registerTUICallback(cb: (n: Notification) => void): () => void {
  tuiCallback = cb;
  channels.tui = true;
  return () => {
    tuiCallback = null;
    channels.tui = false;
  };
}

export function setChannels(patch: Partial<NotificationChannels>): void {
  channels = { ...channels, ...patch };
}

export function getNotificationConfig(): NotificationConfig {
  return { ...config };
}

export async function initNotificationService(): Promise<void> {
  // Load config
  try {
    const { loadConfig } = await import('../config/loader.js');
    const cfg = loadConfig() as Record<string, unknown>;
    const notifCfg = cfg['notifications'] as Partial<NotificationConfig> | undefined;
    if (notifCfg) {
      config = { ...config, ...notifCfg };
      channels.desktop = notifCfg.desktop ?? channels.desktop;
      channels.websocket = notifCfg.websocket ?? channels.websocket;
      channels.n8n = notifCfg.n8n ?? channels.n8n;
    }
  } catch {
    // Config not available — use defaults
  }

  // Seed alert rules from config
  await seedAlertRulesFromConfig();

  // Subscribe to event bus
  onNotification((payload: NotificationPayload) => {
    // Cooldown check
    const cooldownKey = `${payload.type}:${payload.symbol ?? 'global'}`;
    const lastEmit = cooldownMap.get(cooldownKey) ?? 0;
    const now = Date.now();
    if (now - lastEmit < config.cooldownMs) {
      log.debug(`Cooldown active for ${cooldownKey}, skipping`);
      return;
    }

    // Rule filtering
    if (!shouldDeliver(payload)) return;

    const notification: Notification = {
      id: randomUUID(),
      ...payload,
      read: false,
      createdAt: now,
    };

    cooldownMap.set(cooldownKey, now);

    // 1. Persist — always
    try {
      insertNotification(notification);
    } catch (err) {
      log.warn(`Failed to persist notification: ${err}`);
    }

    // 2. Desktop
    if (channels.desktop) {
      void sendDesktopNotification(notification);
    }

    // 3. TUI
    if (tuiCallback) {
      tuiCallback(notification);
    }

    // 4. WebSocket
    if (channels.websocket) {
      void sendWebSocketBroadcast(notification);
    }

    // 5. n8n
    if (channels.n8n) {
      void sendN8nWebhook(notification);
    }

    log.info(`[${notification.severity}] ${notification.title}: ${notification.message}`);
  });

  // Start price alert bridge — polls prices against user-configured thresholds
  try {
    const { startPriceAlertBridge } = await import('./bridges/price-alert-bridge.js');
    await startPriceAlertBridge(config.pollIntervalMs, config.cooldownMs);
    log.info('Price alert bridge started');
  } catch (err) {
    log.debug(
      `Price alert bridge not available: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  log.info('Notification service initialized');
}

// ---------------------------------------------------------------------------
// Private delivery channels
// ---------------------------------------------------------------------------

async function sendDesktopNotification(n: Notification): Promise<void> {
  try {
    const { default: notifier } = await import('node-notifier');
    notifier.notify({
      title: `Vizzor — ${n.title}`,
      message: n.message,
      sound: n.severity === 'critical',
    });
  } catch (err) {
    log.debug(`Desktop notification failed: ${err}`);
  }
}

async function sendWebSocketBroadcast(n: Notification): Promise<void> {
  try {
    const { broadcast } = await import('../api/ws-server.js');
    broadcast('notifications:alert', n);
  } catch {
    // WS server not available
  }
}

async function sendN8nWebhook(n: Notification): Promise<void> {
  try {
    const { loadConfig } = await import('../config/loader.js');
    const cfg = loadConfig();
    if (!cfg.n8n?.enabled || !cfg.n8n.webhookUrl) return;
    await fetch(cfg.n8n.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n),
    });
  } catch (err) {
    log.debug(`n8n webhook failed: ${err}`);
  }
}

async function seedAlertRulesFromConfig(): Promise<void> {
  try {
    const { loadConfig } = await import('../config/loader.js');
    const cfg = loadConfig() as Record<string, unknown>;
    const notifCfg = cfg['notifications'] as { alerts?: Record<string, unknown>[] } | undefined;
    if (!notifCfg?.alerts?.length) return;

    const existing = getAlertRules();
    for (const alertCfg of notifCfg.alerts) {
      const type = String(alertCfg['type'] ?? '');
      if (!type) continue;
      // Only seed if no rule of this type+symbols combo exists
      const symbols = alertCfg['symbols'] as string[] | undefined;
      const alreadyExists = existing.some(
        (r) => r.type === type && JSON.stringify(r.symbols) === JSON.stringify(symbols),
      );
      if (alreadyExists) continue;

      insertAlertRule({
        id: randomUUID(),
        type: type as Notification['type'],
        enabled: alertCfg['enabled'] !== false,
        symbols,
        priceAbove: alertCfg['priceAbove'] as number | undefined,
        priceBelow: alertCfg['priceBelow'] as number | undefined,
        pumpSeverity: alertCfg['pumpSeverity'] as
          | ('low' | 'medium' | 'high' | 'critical')[]
          | undefined,
        agentActions: alertCfg['agentActions'] as ('buy' | 'sell')[] | undefined,
        accuracyMilestone: alertCfg['accuracyMilestone'] as number | undefined,
        createdAt: Date.now(),
      });
    }
  } catch {
    // Config not available
  }
}
