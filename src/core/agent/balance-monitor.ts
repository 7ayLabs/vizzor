// ---------------------------------------------------------------------------
// Balance monitor — periodic balance checks, low-balance alerts
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';

const log = createLogger('balance-monitor');

export interface BalanceAlert {
  agentId: string;
  chain: string;
  address: string;
  balance: bigint;
  threshold: bigint;
  timestamp: number;
}

export type BalanceAlertCallback = (alert: BalanceAlert) => void;

interface WatchEntry {
  agentId: string;
  chain: string;
  address: string;
  threshold: bigint;
}

// Chain RPC endpoints for balance checks
const CHAIN_RPC_URLS: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  polygon: 'https://polygon-rpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  optimism: 'https://mainnet.optimism.io',
  base: 'https://mainnet.base.org',
};

const DEFAULT_CHECK_INTERVAL_MS = 60_000; // 60 seconds

export class BalanceMonitor {
  private watches = new Map<string, WatchEntry>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private checkIntervalMs: number;
  private alertCallback: BalanceAlertCallback;

  constructor(
    checkIntervalMs: number = DEFAULT_CHECK_INTERVAL_MS,
    alertCallback: BalanceAlertCallback,
  ) {
    this.checkIntervalMs = checkIntervalMs;
    this.alertCallback = alertCallback;
    log.info(`Balance monitor created (check interval: ${checkIntervalMs}ms)`);
  }

  addWatch(agentId: string, chain: string, address: string, threshold: bigint): void {
    this.watches.set(agentId, { agentId, chain, address, threshold });
    log.info(
      `Added balance watch: agent=${agentId} chain=${chain} address=${address} threshold=${threshold}`,
    );
  }

  removeWatch(agentId: string): void {
    const removed = this.watches.delete(agentId);
    if (removed) {
      log.info(`Removed balance watch for agent ${agentId}`);
    }
  }

  start(): void {
    if (this.interval) {
      log.warn('Balance monitor already running');
      return;
    }

    log.info(`Starting balance monitor (${this.watches.size} watches)`);

    this.interval = setInterval(() => {
      void this.checkBalances();
    }, this.checkIntervalMs);

    // Initial check
    void this.checkBalances();
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      log.info('Balance monitor stopped');
    }
  }

  async checkBalances(): Promise<BalanceAlert[]> {
    const alerts: BalanceAlert[] = [];

    for (const [, watch] of this.watches) {
      try {
        const balance = await this.getBalance(watch.chain, watch.address);

        if (balance < watch.threshold) {
          const alert: BalanceAlert = {
            agentId: watch.agentId,
            chain: watch.chain,
            address: watch.address,
            balance,
            threshold: watch.threshold,
            timestamp: Date.now(),
          };

          alerts.push(alert);
          this.alertCallback(alert);

          log.warn(
            `LOW BALANCE ALERT: agent=${watch.agentId} chain=${watch.chain} ` +
              `balance=${balance} threshold=${watch.threshold}`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(
          `Failed to check balance for agent ${watch.agentId} on ${watch.chain}: ${message}`,
        );
      }
    }

    return alerts;
  }

  private async getBalance(chain: string, address: string): Promise<bigint> {
    const rpcUrl = CHAIN_RPC_URLS[chain];
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for chain: ${chain}`);
    }

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      result?: string;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    if (!data.result) {
      throw new Error('No result from RPC balance query');
    }

    return BigInt(data.result);
  }
}
