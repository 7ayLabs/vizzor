// ---------------------------------------------------------------------------
// WebSocket connection manager — singleton with price cache
// ---------------------------------------------------------------------------

import { BinanceWebSocket, type WSTrade, type WSKline, type WSTicker } from './binance-ws.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ws-manager');

const MAX_STREAMS_PER_CONN = 1024;
const MAX_CONNECTIONS = 5;

export interface PriceCache {
  price: number;
  time: number;
}

export class WSManager {
  private connections: BinanceWebSocket[] = [];
  private priceCache = new Map<string, PriceCache>();
  private subscriptions = new Map<string, Set<string>>(); // symbol → stream types
  private tradeCallbacks = new Map<string, Set<(trade: WSTrade) => void>>();
  private klineCallbacks = new Map<string, Set<(kline: WSKline) => void>>();
  private started = false;

  subscribe(
    symbol: string,
    streams: ('trade' | 'kline_1m' | 'ticker')[] = ['trade', 'ticker'],
  ): void {
    const existing = this.subscriptions.get(symbol) ?? new Set();
    for (const s of streams) {
      existing.add(s);
    }
    this.subscriptions.set(symbol, existing);
  }

  unsubscribe(symbol: string): void {
    this.subscriptions.delete(symbol);
    this.priceCache.delete(symbol.toUpperCase());
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    // Build stream list from subscriptions
    const allStreams: string[] = [];
    for (const [symbol, types] of this.subscriptions) {
      const lower = symbol.toLowerCase();
      for (const type of types) {
        if (type === 'trade') allStreams.push(`${lower}@trade`);
        else if (type === 'kline_1m') allStreams.push(`${lower}@kline_1m`);
        else if (type === 'ticker') allStreams.push(`${lower}@ticker`);
      }
    }

    if (allStreams.length === 0) {
      log.info('No subscriptions — WebSocket manager idle');
      return;
    }

    // Split into connection groups
    for (let i = 0; i < allStreams.length; i += MAX_STREAMS_PER_CONN) {
      if (this.connections.length >= MAX_CONNECTIONS) break;
      const chunk = allStreams.slice(i, i + MAX_STREAMS_PER_CONN);
      const ws = new BinanceWebSocket(chunk);

      ws.on('trade', (trade: WSTrade) => {
        this.priceCache.set(trade.symbol, { price: trade.price, time: trade.time });
        const callbacks = this.tradeCallbacks.get(trade.symbol);
        if (callbacks) {
          for (const cb of callbacks) cb(trade);
        }
      });

      ws.on('ticker', (ticker: WSTicker) => {
        this.priceCache.set(ticker.symbol, { price: ticker.price, time: Date.now() });
      });

      ws.on('kline', (kline: WSKline) => {
        const key = `${kline.symbol}:${kline.interval}`;
        const callbacks = this.klineCallbacks.get(key);
        if (callbacks) {
          for (const cb of callbacks) cb(kline);
        }
      });

      ws.connect();
      this.connections.push(ws);
    }

    log.info(
      `WebSocket manager started: ${this.connections.length} connections, ${allStreams.length} streams`,
    );
  }

  stop(): void {
    for (const ws of this.connections) {
      ws.close();
    }
    this.connections = [];
    this.started = false;
    log.info('WebSocket manager stopped');
  }

  getLatestPrice(symbol: string): number | null {
    const upper = symbol.toUpperCase().replace('/', '');
    const cached = this.priceCache.get(upper);
    if (!cached) return null;
    // Cache valid for 60 seconds
    if (Date.now() - cached.time > 60000) return null;
    return cached.price;
  }

  onTrade(symbol: string, callback: (trade: WSTrade) => void): void {
    const upper = symbol.toUpperCase();
    const set = this.tradeCallbacks.get(upper) ?? new Set();
    set.add(callback);
    this.tradeCallbacks.set(upper, set);
  }

  onKline(symbol: string, interval: string, callback: (kline: WSKline) => void): void {
    const key = `${symbol.toUpperCase()}:${interval}`;
    const set = this.klineCallbacks.get(key) ?? new Set();
    set.add(callback);
    this.klineCallbacks.set(key, set);
  }
}

// Singleton
let instance: WSManager | null = null;

export function getWSManager(): WSManager | null {
  return instance;
}

export function initWSManager(): WSManager {
  if (!instance) {
    instance = new WSManager();
  }
  return instance;
}
