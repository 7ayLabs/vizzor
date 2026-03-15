// ---------------------------------------------------------------------------
// Binance WebSocket client — real-time market data streams
// ---------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('binance-ws');

const BASE_URL = 'wss://stream.binance.com:9443/ws';

export interface WSTrade {
  symbol: string;
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

export interface WSKline {
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
  closeTime: number;
  isClosed: boolean;
}

export interface WSTicker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePct: number;
  volume: number;
  quoteVolume: number;
}

export class BinanceWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private streams: string[] = [];
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnecting = false;
  private closed = false;

  constructor(streams: string[]) {
    super();
    this.streams = streams;
  }

  connect(): void {
    if (this.closed) return;
    const url =
      this.streams.length === 1
        ? `${BASE_URL}/${this.streams[0]}`
        : `${BASE_URL}/${this.streams.join('/')}`;

    log.debug(`Connecting to ${url}`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      log.info(`WebSocket connected (${this.streams.length} streams)`);
      this.reconnectDelay = 1000;
      this.reconnecting = false;
      this.startHeartbeat();
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>;
        this.handleMessage(data);
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.closed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      log.debug('WebSocket error');
    };
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: Record<string, unknown>): void {
    const eventType = data['e'] as string | undefined;

    if (eventType === 'trade') {
      const trade: WSTrade = {
        symbol: String(data['s']),
        price: Number(data['p']),
        quantity: Number(data['q']),
        time: Number(data['T']),
        isBuyerMaker: Boolean(data['m']),
      };
      this.emit('trade', trade);
    } else if (eventType === 'kline') {
      const k = data['k'] as Record<string, unknown>;
      const kline: WSKline = {
        symbol: String(data['s']),
        interval: String(k['i']),
        open: Number(k['o']),
        high: Number(k['h']),
        low: Number(k['l']),
        close: Number(k['c']),
        volume: Number(k['v']),
        openTime: Number(k['t']),
        closeTime: Number(k['T']),
        isClosed: Boolean(k['x']),
      };
      this.emit('kline', kline);
    } else if (eventType === '24hrTicker') {
      const ticker: WSTicker = {
        symbol: String(data['s']),
        price: Number(data['c']),
        priceChange: Number(data['p']),
        priceChangePct: Number(data['P']),
        volume: Number(data['v']),
        quoteVolume: Number(data['q']),
      };
      this.emit('ticker', ticker);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting || this.closed) return;
    this.reconnecting = true;
    log.info(`Reconnecting in ${this.reconnectDelay}ms...`);
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'PING' }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
