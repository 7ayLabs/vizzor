// ---------------------------------------------------------------------------
// LaunchpadWSListener — WebSocket listener for Solana token migration events
// Monitors bonding curve completions on launchpad platforms (pump.fun, etc.)
// ---------------------------------------------------------------------------

import { createLogger } from '../../utils/logger.js';

const log = createLogger('launchpad-ws');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationEvent {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  bondingCurveProgress: number; // 0-100
  marketCap: number;
  liquidity: number;
  dexProgram: string; // raydium, orca, etc.
  timestamp: number;
}

export type MigrationCallback = (event: MigrationEvent) => void;

export interface LaunchpadWSConfig {
  /** WebSocket endpoint URL */
  wsUrl?: string;
  /** Reconnect interval in ms (default 5000) */
  reconnectIntervalMs?: number;
  /** Max reconnect attempts before giving up (default 20) */
  maxReconnectAttempts?: number;
  /** Heartbeat / ping interval in ms (default 30000) */
  heartbeatIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Known Solana program IDs for migration detection
// ---------------------------------------------------------------------------

/** Raydium AMM program */
const RAYDIUM_AMM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
/** Orca Whirlpool program */
const ORCA_WHIRLPOOL_PROGRAM = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
/** Pump.fun bonding curve program */
const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

const MIGRATION_PROGRAMS = new Set([RAYDIUM_AMM_PROGRAM, ORCA_WHIRLPOOL_PROGRAM, PUMP_FUN_PROGRAM]);

const DEX_PROGRAM_NAMES: Record<string, string> = {
  [RAYDIUM_AMM_PROGRAM]: 'raydium',
  [ORCA_WHIRLPOOL_PROGRAM]: 'orca',
  [PUMP_FUN_PROGRAM]: 'pumpfun',
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_WS_URL = 'wss://api.mainnet-beta.solana.com';
const DEFAULT_RECONNECT_INTERVAL = 5000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 20;
const DEFAULT_HEARTBEAT_INTERVAL = 30000;

// ---------------------------------------------------------------------------
// LaunchpadWSListener
// ---------------------------------------------------------------------------

export class LaunchpadWSListener {
  private callback: MigrationCallback;
  private wsUrl: string;
  private reconnectIntervalMs: number;
  private maxReconnectAttempts: number;
  private heartbeatIntervalMs: number;

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private stopped = true;
  private subscriptionId: number | null = null;
  private rpcId = 0;

  // Stats
  private eventsReceived = 0;
  private lastEventAt: number | null = null;

  constructor(callback: MigrationCallback, config?: LaunchpadWSConfig) {
    this.callback = callback;
    this.wsUrl = config?.wsUrl ?? DEFAULT_WS_URL;
    this.reconnectIntervalMs = config?.reconnectIntervalMs ?? DEFAULT_RECONNECT_INTERVAL;
    this.maxReconnectAttempts = config?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.heartbeatIntervalMs = config?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(): void {
    if (!this.stopped) {
      log.warn('LaunchpadWSListener already started');
      return;
    }

    // Check WebSocket availability (Node 21+ has native WS)
    if (typeof WebSocket === 'undefined') {
      log.error(
        'WebSocket is not available in this environment. ' +
          'Requires Node.js 21+ or a WebSocket polyfill.',
      );
      return;
    }

    this.stopped = false;
    this.reconnectAttempts = 0;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    this.clearHeartbeat();

    if (this.ws) {
      // Attempt to unsubscribe before closing
      if (this.subscriptionId !== null && this.connected) {
        this.sendRpc('blockUnsubscribe', [this.subscriptionId]);
      }
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.subscriptionId = null;
    log.info('LaunchpadWSListener stopped');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStats(): { connected: boolean; eventsReceived: number; lastEventAt: number | null } {
    return {
      connected: this.connected,
      eventsReceived: this.eventsReceived,
      lastEventAt: this.lastEventAt,
    };
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;

    log.info(`Connecting to Solana WS: ${this.wsUrl}`);

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      log.error(`Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      log.info('Solana WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.subscribeToBlocks();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>;
        this.handleMessage(data);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      log.info('Solana WebSocket disconnected');
      this.connected = false;
      this.subscriptionId = null;
      this.clearHeartbeat();

      if (!this.stopped) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      log.debug('Solana WebSocket error');
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    this.clearReconnectTimer();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      this.stopped = true;
      return;
    }

    // Exponential backoff with jitter
    const backoff = Math.min(
      this.reconnectIntervalMs * Math.pow(1.5, this.reconnectAttempts),
      60000,
    );
    const jitter = Math.random() * backoff * 0.3;
    const delay = Math.round(backoff + jitter);

    log.info(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.ws) {
        // Solana WS doesn't require pings but sending a getHealth keeps the connection alive
        this.sendRpc('getHealth', []);
      }
    }, this.heartbeatIntervalMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // RPC helpers
  // -------------------------------------------------------------------------

  private sendRpc(method: string, params: unknown[]): number {
    const id = ++this.rpcId;
    if (this.ws && this.connected) {
      this.ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }),
      );
    }
    return id;
  }

  private subscribeToBlocks(): void {
    // Subscribe to blocks that mention known migration program accounts
    // Using blockSubscribe with filter for mentions of migration programs
    this.sendRpc('blockSubscribe', [
      {
        mentionsAccountOrProgram: PUMP_FUN_PROGRAM,
      },
      {
        commitment: 'confirmed',
        encoding: 'json',
        transactionDetails: 'full',
        showRewards: false,
        maxSupportedTransactionVersion: 0,
      },
    ]);

    log.info('Subscribed to block notifications for migration programs');
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  private handleMessage(data: Record<string, unknown>): void {
    // Handle subscription confirmation
    if ('id' in data && 'result' in data && typeof data['result'] === 'number') {
      this.subscriptionId = data['result'] as number;
      log.debug(`Block subscription confirmed: ${this.subscriptionId}`);
      return;
    }

    // Handle subscription notification
    if (data['method'] === 'blockNotification') {
      const params = data['params'] as Record<string, unknown> | undefined;
      if (!params) return;

      const result = params['result'] as Record<string, unknown> | undefined;
      if (!result) return;

      const value = result['value'] as Record<string, unknown> | undefined;
      if (!value) return;

      const block = value['block'] as Record<string, unknown> | undefined;
      if (!block) return;

      this.processBlock(block);
    }
  }

  private processBlock(block: Record<string, unknown>): void {
    const transactions = block['transactions'] as unknown[] | undefined;
    if (!Array.isArray(transactions)) return;

    const blockTime =
      typeof block['blockTime'] === 'number' ? block['blockTime'] : Math.floor(Date.now() / 1000);

    for (const tx of transactions) {
      if (!tx || typeof tx !== 'object') continue;
      this.processTransaction(tx as Record<string, unknown>, blockTime);
    }
  }

  private processTransaction(tx: Record<string, unknown>, blockTime: number): void {
    const txData = tx['transaction'] as Record<string, unknown> | undefined;
    if (!txData) return;

    const message = txData['message'] as Record<string, unknown> | undefined;
    if (!message) return;

    const accountKeys = message['accountKeys'] as string[] | undefined;
    if (!Array.isArray(accountKeys)) return;

    // Check if any migration program is involved
    const involvedPrograms = accountKeys.filter((key) => MIGRATION_PROGRAMS.has(key));
    if (involvedPrograms.length === 0) return;

    // Parse instructions looking for migration patterns
    const instructions = message['instructions'] as unknown[] | undefined;
    if (!Array.isArray(instructions)) return;

    // Look for patterns that indicate a bonding curve completion / DEX listing
    // A migration typically involves: bonding curve program -> DEX AMM program
    const hasDexProgram = involvedPrograms.some(
      (p) => p === RAYDIUM_AMM_PROGRAM || p === ORCA_WHIRLPOOL_PROGRAM,
    );
    const hasBondingProgram = involvedPrograms.some((p) => p === PUMP_FUN_PROGRAM);

    if (hasBondingProgram && hasDexProgram) {
      // This looks like a migration event
      const dexProgram = involvedPrograms.find(
        (p) => p === RAYDIUM_AMM_PROGRAM || p === ORCA_WHIRLPOOL_PROGRAM,
      );

      const event = this.buildMigrationEvent(
        accountKeys,
        dexProgram ?? RAYDIUM_AMM_PROGRAM,
        blockTime,
      );

      if (event) {
        this.eventsReceived++;
        this.lastEventAt = Date.now();
        log.info(`Migration detected: ${event.symbol} (${event.mint}) -> ${event.dexProgram}`);

        try {
          this.callback(event);
        } catch (err) {
          log.error(
            `Migration callback error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  private buildMigrationEvent(
    accountKeys: string[],
    dexProgramId: string,
    blockTime: number,
  ): MigrationEvent | null {
    // Account keys layout for a pump.fun migration:
    // [0] = payer/creator, [1+] = various accounts including mint
    // The exact layout depends on the instruction, but we can extract key info
    const creator = accountKeys[0] ?? 'unknown';
    // The mint is typically one of the first few accounts after the creator
    const mint = accountKeys[1] ?? 'unknown';

    if (mint === 'unknown') return null;

    return {
      mint,
      name: '', // Will be resolved by the consumer via getCoinDetails
      symbol: '', // Will be resolved by the consumer via getCoinDetails
      creator,
      bondingCurveProgress: 100, // Migration means bonding curve is complete
      marketCap: 0, // Will be resolved by the consumer
      liquidity: 0, // Will be resolved by the consumer
      dexProgram: DEX_PROGRAM_NAMES[dexProgramId] ?? 'unknown',
      timestamp: blockTime * 1000,
    };
  }
}
