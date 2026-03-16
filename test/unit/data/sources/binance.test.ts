import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchTickerPrice,
  fetchMultipleTickerPrices,
  fetchKlines,
  fetchOrderBookSummary,
  fetchOrderBookDepth,
  fetchLongShortRatio,
  fetchTopTraderRatio,
  fetchTakerBuySellRatio,
} from '@/data/sources/binance.js';

// ---------------------------------------------------------------------------
// Mock fetch globally so tests don't hit real APIs
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// fetchTickerPrice
// ---------------------------------------------------------------------------

describe('fetchTickerPrice', () => {
  it('returns price and 24h change for a valid symbol', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        symbol: 'BTCUSDT',
        lastPrice: '67450.12',
        priceChangePercent: '2.35',
      }),
    });

    const result = await fetchTickerPrice('BTC');
    expect(result.symbol).toBe('BTC');
    expect(result.price).toBe(67450.12);
    expect(result.change24h).toBe(2.35);
  });

  it('maps common symbols to correct Binance pairs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        symbol: 'ETHUSDT',
        lastPrice: '3200.50',
        priceChangePercent: '-1.20',
      }),
    });

    const result = await fetchTickerPrice('ETH');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('symbol=ETHUSDT'));
    expect(result.price).toBe(3200.5);
    expect(result.change24h).toBe(-1.2);
  });

  it('handles unknown symbols by appending USDT', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        symbol: 'XYZUSDT',
        lastPrice: '0.0012',
        priceChangePercent: '15.50',
      }),
    });

    await fetchTickerPrice('XYZ');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('symbol=XYZUSDT'));
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    await expect(fetchTickerPrice('INVALID')).rejects.toThrow('Binance API error');
  });

  it('handles negative price changes correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        symbol: 'SOLUSDT',
        lastPrice: '145.60',
        priceChangePercent: '-8.75',
      }),
    });

    const result = await fetchTickerPrice('SOL');
    expect(result.change24h).toBeLessThan(0);
    expect(result.change24h).toBe(-8.75);
  });
});

// ---------------------------------------------------------------------------
// fetchMultipleTickerPrices
// ---------------------------------------------------------------------------

describe('fetchMultipleTickerPrices', () => {
  it('fetches multiple symbols in a single request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { symbol: 'BTCUSDT', lastPrice: '67000', priceChangePercent: '1.0' },
        { symbol: 'ETHUSDT', lastPrice: '3200', priceChangePercent: '-0.5' },
      ],
    });

    const result = await fetchMultipleTickerPrices(['BTC', 'ETH']);
    expect(result.size).toBe(2);
    expect(result.get('BTC')?.price).toBe(67000);
    expect(result.get('ETH')?.price).toBe(3200);
  });
});

// ---------------------------------------------------------------------------
// fetchKlines
// ---------------------------------------------------------------------------

describe('fetchKlines', () => {
  it('returns parsed kline/candlestick data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        [
          1700000000000,
          '67000',
          '67500',
          '66500',
          '67200',
          '1234.5',
          1700003600000,
          '82345678',
          5000,
        ],
      ],
    });

    const klines = await fetchKlines('BTC', '1h', 1);
    expect(klines).toHaveLength(1);
    expect(klines[0]!.open).toBe(67000);
    expect(klines[0]!.high).toBe(67500);
    expect(klines[0]!.low).toBe(66500);
    expect(klines[0]!.close).toBe(67200);
    expect(klines[0]!.volume).toBe(1234.5);
  });
});

// ---------------------------------------------------------------------------
// fetchOrderBookSummary
// ---------------------------------------------------------------------------

describe('fetchOrderBookSummary', () => {
  it('calculates spread correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bidPrice: '67000.00',
        bidQty: '10.5',
        askPrice: '67001.00',
        askQty: '8.3',
      }),
    });

    const book = await fetchOrderBookSummary('BTC');
    expect(book.spread).toBeCloseTo(1.0);
    expect(book.spreadPct).toBeGreaterThan(0);
    expect(book.spreadPct).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// fetchOrderBookDepth
// ---------------------------------------------------------------------------

describe('fetchOrderBookDepth', () => {
  it('returns parsed depth with wall clusters and imbalance', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bids: [
          ['67000.00', '5.0'],
          ['66999.00', '3.0'],
          ['66998.00', '2.0'],
        ],
        asks: [
          ['67001.00', '4.0'],
          ['67002.00', '2.5'],
          ['67003.00', '1.5'],
        ],
      }),
    });

    const depth = await fetchOrderBookDepth('BTC', 5);
    expect(depth.symbol).toBe('BTC');
    expect(depth.bids).toHaveLength(3);
    expect(depth.asks).toHaveLength(3);
    expect(depth.bids[0]![0]).toBe(67000);
    expect(depth.bids[0]![1]).toBe(5);
    expect(depth.asks[0]![0]).toBe(67001);
    // imbalanceRatio = totalBids / totalAsks = 10 / 8 = 1.25
    expect(depth.imbalanceRatio).toBeCloseTo(1.25, 1);
    expect(depth.bidWallZones.length).toBeGreaterThan(0);
    expect(depth.askWallZones.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// fetchLongShortRatio
// ---------------------------------------------------------------------------

describe('fetchLongShortRatio', () => {
  it('returns parsed L/S ratio history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          timestamp: 1700000000000,
          longAccount: '0.5500',
          shortAccount: '0.4500',
          longShortRatio: '1.2222',
        },
      ],
    });

    const result = await fetchLongShortRatio('BTC');
    expect(result.symbol).toBe('BTC');
    expect(result.period).toBe('1h');
    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.longAccount).toBe(0.55);
    expect(result.history[0]!.shortAccount).toBe(0.45);
    expect(result.history[0]!.longShortRatio).toBeCloseTo(1.2222);
  });
});

// ---------------------------------------------------------------------------
// fetchTopTraderRatio
// ---------------------------------------------------------------------------

describe('fetchTopTraderRatio', () => {
  it('returns parsed top trader ratio history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          timestamp: 1700000000000,
          longAccount: '0.6000',
          shortAccount: '0.4000',
          longShortRatio: '1.5000',
        },
      ],
    });

    const result = await fetchTopTraderRatio('ETH');
    expect(result.symbol).toBe('ETH');
    expect(result.period).toBe('1h');
    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.longShortRatio).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// fetchTakerBuySellRatio
// ---------------------------------------------------------------------------

describe('fetchTakerBuySellRatio', () => {
  it('returns parsed taker buy/sell ratio history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          timestamp: 1700000000000,
          buySellRatio: '1.1500',
          buyVol: '5000000',
          sellVol: '4347826',
        },
      ],
    });

    const result = await fetchTakerBuySellRatio('BTC');
    expect(result.symbol).toBe('BTC');
    expect(result.period).toBe('1h');
    expect(result.history).toHaveLength(1);
    expect(result.history[0]!.buySellRatio).toBe(1.15);
    expect(result.history[0]!.buyVol).toBe(5000000);
    expect(result.history[0]!.sellVol).toBe(4347826);
  });
});
