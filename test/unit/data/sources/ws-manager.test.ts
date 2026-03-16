import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Mock the BinanceWebSocket class as an EventEmitter
// ---------------------------------------------------------------------------

// Track created instances so tests can emit events on them
const createdInstances: EventEmitter[] = [];

vi.mock('@/data/sources/binance-ws.js', () => {
  const BinanceWebSocket = vi.fn(function (this: EventEmitter, _streams: string[]) {
    EventEmitter.call(this);
    (this as unknown as Record<string, unknown>).connect = vi.fn();
    (this as unknown as Record<string, unknown>).close = vi.fn();
    createdInstances.push(this);
  });
  // Inherit from EventEmitter
  BinanceWebSocket.prototype = Object.create(EventEmitter.prototype);
  BinanceWebSocket.prototype.constructor = BinanceWebSocket;

  return { BinanceWebSocket };
});

import { WSManager } from '@/data/sources/ws-manager.js';
import { BinanceWebSocket } from '@/data/sources/binance-ws.js';

describe('WSManager', () => {
  let manager: WSManager;

  beforeEach(() => {
    createdInstances.length = 0;
    vi.clearAllMocks();
    manager = new WSManager();
  });

  // -------------------------------------------------------------------------
  // 1. subscribe adds symbol to subscriptions
  // -------------------------------------------------------------------------
  it('subscribe adds symbol to subscriptions', () => {
    manager.subscribe('BTCUSDT', ['trade', 'ticker']);
    manager.start();

    // BinanceWebSocket constructor was called, meaning streams were built
    expect(BinanceWebSocket).toHaveBeenCalled();
    manager.stop();
  });

  // -------------------------------------------------------------------------
  // 2. unsubscribe removes symbol and clears price cache
  // -------------------------------------------------------------------------
  it('unsubscribe removes symbol and clears price cache', () => {
    manager.subscribe('BTCUSDT', ['trade']);
    manager.unsubscribe('BTCUSDT');

    manager.start();
    expect(BinanceWebSocket).not.toHaveBeenCalled();
    expect(manager.getLatestPrice('BTCUSDT')).toBeNull();
    manager.stop();
  });

  // -------------------------------------------------------------------------
  // 3. start creates connections for subscribed symbols
  // -------------------------------------------------------------------------
  it('start creates connections for subscribed symbols', () => {
    manager.subscribe('BTCUSDT', ['trade']);
    manager.subscribe('ETHUSDT', ['ticker']);
    manager.start();

    expect(BinanceWebSocket).toHaveBeenCalledTimes(1);
    expect(createdInstances).toHaveLength(1);

    const instance = createdInstances[0] as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(instance['connect']).toHaveBeenCalled();

    manager.stop();
  });

  // -------------------------------------------------------------------------
  // 4. start with no subscriptions does nothing
  // -------------------------------------------------------------------------
  it('start with no subscriptions does nothing', () => {
    manager.start();
    expect(BinanceWebSocket).not.toHaveBeenCalled();
    manager.stop();
  });

  // -------------------------------------------------------------------------
  // 5. getLatestPrice returns null when no data
  // -------------------------------------------------------------------------
  it('getLatestPrice returns null when no data', () => {
    expect(manager.getLatestPrice('BTCUSDT')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 6. getLatestPrice returns price after trade event
  // -------------------------------------------------------------------------
  it('getLatestPrice returns price after trade event', () => {
    manager.subscribe('BTCUSDT', ['trade']);
    manager.start();

    const wsInstance = createdInstances[0]!;

    wsInstance.emit('trade', {
      symbol: 'BTCUSDT',
      price: 65000,
      quantity: 1.5,
      time: Date.now(),
      isBuyerMaker: false,
    });

    expect(manager.getLatestPrice('BTCUSDT')).toBe(65000);
    manager.stop();
  });

  // -------------------------------------------------------------------------
  // 7. getLatestPrice returns null for expired cache (>60s)
  // -------------------------------------------------------------------------
  it('getLatestPrice returns null for expired cache (>60s)', () => {
    manager.subscribe('BTCUSDT', ['trade']);
    manager.start();

    const wsInstance = createdInstances[0]!;

    const staleTime = Date.now() - 61_000;
    wsInstance.emit('trade', {
      symbol: 'BTCUSDT',
      price: 65000,
      quantity: 1.5,
      time: staleTime,
      isBuyerMaker: false,
    });

    expect(manager.getLatestPrice('BTCUSDT')).toBeNull();
    manager.stop();
  });

  // -------------------------------------------------------------------------
  // 8. stop closes all connections
  // -------------------------------------------------------------------------
  it('stop closes all connections', () => {
    manager.subscribe('BTCUSDT', ['trade']);
    manager.subscribe('ETHUSDT', ['ticker']);
    manager.start();

    const instance = createdInstances[0] as unknown as Record<string, ReturnType<typeof vi.fn>>;

    manager.stop();

    expect(instance['close']).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 9. onTrade callback is called on trade events
  // -------------------------------------------------------------------------
  it('onTrade callback is called on trade events', () => {
    const tradeCb = vi.fn();
    manager.onTrade('BTCUSDT', tradeCb);
    manager.subscribe('BTCUSDT', ['trade']);
    manager.start();

    const wsInstance = createdInstances[0]!;

    const tradeData = {
      symbol: 'BTCUSDT',
      price: 64500,
      quantity: 0.5,
      time: Date.now(),
      isBuyerMaker: true,
    };
    wsInstance.emit('trade', tradeData);

    expect(tradeCb).toHaveBeenCalledTimes(1);
    expect(tradeCb).toHaveBeenCalledWith(tradeData);
  });

  // -------------------------------------------------------------------------
  // 10. double start is prevented
  // -------------------------------------------------------------------------
  it('double start is prevented', () => {
    manager.subscribe('BTCUSDT', ['trade']);
    manager.start();
    manager.start(); // second call should be a no-op

    expect(BinanceWebSocket).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});
