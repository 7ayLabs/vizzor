// ---------------------------------------------------------------------------
// Price alert bridge — monitors live prices against user-configured thresholds
// Polls prices via fetchTickerPrice and emits price_threshold notifications
// when configured alert rules are triggered.
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';
import { emitNotification } from '../event-bus.js';
import { getAlertRules } from '../store.js';

const log = createLogger('price-alert-bridge');

// Track last triggered state per rule to avoid repeated firing
const lastTriggered = new Map<string, number>();

/**
 * Start the price alert bridge.
 * Polls Binance ticker prices and checks against price_threshold rules.
 *
 * @param pollIntervalMs — how often to check prices (from config)
 * @param cooldownMs — minimum time between alerts for the same rule (from config)
 */
export async function startPriceAlertBridge(
  pollIntervalMs: number,
  cooldownMs: number,
): Promise<() => void> {
  let fetchTickerPrice: ((symbol: string) => Promise<{ price: number }>) | null = null;

  try {
    const binance = await import('../../data/sources/binance.js');
    fetchTickerPrice = binance.fetchTickerPrice;
  } catch {
    log.debug('Binance data source not available — price alert bridge disabled');
    return () => {
      /* noop */
    };
  }

  const checkPrices = async (): Promise<void> => {
    const rules = getAlertRules().filter((r) => r.enabled && r.type === 'price_threshold');
    if (rules.length === 0) return;

    // Collect all symbols we need to watch
    const watchSymbols = new Set<string>();
    for (const rule of rules) {
      if (rule.symbols) {
        for (const s of rule.symbols) watchSymbols.add(s.toUpperCase());
      }
    }

    // Fetch price for each watched symbol
    for (const symbol of watchSymbols) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const ticker = await fetchTickerPrice!(symbol);

        for (const rule of rules) {
          if (rule.symbols && !rule.symbols.includes(symbol)) continue;

          const now = Date.now();
          const ruleKey = `${rule.id}:${symbol}`;
          const lastTime = lastTriggered.get(ruleKey) ?? 0;
          if (now - lastTime < cooldownMs) continue;

          let triggered = false;
          let direction = '';

          if (rule.priceAbove !== undefined && ticker.price >= rule.priceAbove) {
            triggered = true;
            direction = `above $${rule.priceAbove.toLocaleString()}`;
          } else if (rule.priceBelow !== undefined && ticker.price <= rule.priceBelow) {
            triggered = true;
            direction = `below $${rule.priceBelow.toLocaleString()}`;
          }

          if (triggered) {
            lastTriggered.set(ruleKey, now);

            emitNotification({
              type: 'price_threshold',
              title: `Price Alert: ${symbol}`,
              message: `${symbol} is now ${direction} — current price: $${ticker.price.toLocaleString()}`,
              severity: 'warning',
              symbol,
              metadata: {
                price: ticker.price,
                priceAbove: rule.priceAbove,
                priceBelow: rule.priceBelow,
                ruleId: rule.id,
              },
            });

            log.info(`Price alert triggered: ${symbol} ${direction} ($${ticker.price})`);
          }
        }
      } catch {
        // Price fetch failed for this symbol — skip
      }
    }
  };

  const interval = setInterval(() => {
    void checkPrices();
  }, pollIntervalMs);

  // Run first check immediately
  void checkPrices();

  log.info(`Price alert bridge started (poll every ${pollIntervalMs}ms)`);

  return () => {
    clearInterval(interval);
  };
}
