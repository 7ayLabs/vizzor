import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Mock DexScreener
// ---------------------------------------------------------------------------

const mockDexSearch = vi.fn();
const mockGetTopBoostedTokens = vi.fn();

vi.mock('@/data/sources/dexscreener.js', () => ({
  searchTokens: (...args: unknown[]) => mockDexSearch(...args),
  getTopBoostedTokens: (...args: unknown[]) => mockGetTopBoostedTokens(...args),
}));

// ---------------------------------------------------------------------------
// Mock ML client
// ---------------------------------------------------------------------------

const mockScoreTrend = vi.fn();
const mockGetMLClient = vi.fn().mockReturnValue(null);

vi.mock('@/ml/client.js', () => ({
  getMLClient: (...args: unknown[]) => mockGetMLClient(...args),
}));

import {
  fetchMarketData,
  fetchTokenFromDex,
  fetchTrendingTokens,
  analyzeTrend,
  analyzeTrendML,
} from '@/core/trends/market.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  mockGetMLClient.mockReturnValue(null);
  mockDexSearch.mockResolvedValue([]);
  mockGetTopBoostedTokens.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// fetchMarketData (CoinGecko)
// ---------------------------------------------------------------------------

describe('fetchMarketData', () => {
  it('returns market data from CoinGecko', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          symbol: 'btc',
          name: 'Bitcoin',
          current_price: 67000,
          price_change_percentage_24h: 2.5,
          price_change_percentage_7d_in_currency: 8.3,
          total_volume: 45000000000,
          market_cap: 1300000000000,
          market_cap_rank: 1,
        },
      ],
    });

    const result = await fetchMarketData('bitcoin');

    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('BTC');
    expect(result!.name).toBe('Bitcoin');
    expect(result!.price).toBe(67000);
    expect(result!.priceChange24h).toBe(2.5);
    expect(result!.priceChange7d).toBe(8.3);
    expect(result!.volume24h).toBe(45000000000);
    expect(result!.marketCap).toBe(1300000000000);
    expect(result!.rank).toBe(1);
  });

  it('returns null when CoinGecko returns empty array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await fetchMarketData('unknown');

    expect(result).toBeNull();
  });

  it('returns null when CoinGecko API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const result = await fetchMarketData('bitcoin');

    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchMarketData('bitcoin');

    expect(result).toBeNull();
  });

  it('handles null market_cap_rank gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          symbol: 'xyz',
          name: 'XyzToken',
          current_price: 0.001,
          price_change_percentage_24h: 50,
          price_change_percentage_7d_in_currency: null,
          total_volume: 1000,
          market_cap: 0,
          market_cap_rank: null,
        },
      ],
    });

    const result = await fetchMarketData('xyz');

    expect(result).not.toBeNull();
    expect(result!.rank).toBeNull();
    expect(result!.priceChange7d).toBe(0); // Number(null) → 0
  });
});

// ---------------------------------------------------------------------------
// fetchTokenFromDex
// ---------------------------------------------------------------------------

describe('fetchTokenFromDex', () => {
  it('delegates to DexScreener searchTokens', async () => {
    const pairs = [
      {
        chainId: 'ethereum',
        baseToken: { symbol: 'PEPE', name: 'Pepe' },
        priceUsd: '0.0001',
      },
    ];
    mockDexSearch.mockResolvedValueOnce(pairs);

    const result = await fetchTokenFromDex('PEPE');

    expect(mockDexSearch).toHaveBeenCalledWith('PEPE');
    expect(result).toEqual(pairs);
  });

  it('returns empty array on DexScreener failure', async () => {
    mockDexSearch.mockRejectedValueOnce(new Error('DexScreener down'));

    const result = await fetchTokenFromDex('PEPE');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchTrendingTokens
// ---------------------------------------------------------------------------

describe('fetchTrendingTokens', () => {
  it('combines DexScreener boosted tokens and CoinGecko trending', async () => {
    // DexScreener boosted tokens
    mockGetTopBoostedTokens.mockResolvedValueOnce([
      { chainId: 'solana', tokenAddress: '0xabc', amount: 100, totalAmount: 500 },
    ]);
    // DexScreener search for the boosted token
    mockDexSearch.mockResolvedValueOnce([
      {
        chainId: 'solana',
        dexId: 'raydium',
        pairAddress: '0xpair1',
        url: 'https://dexscreener.com/solana/0xpair1',
        baseToken: { address: '0xabc', name: 'MoonCoin', symbol: 'MOON' },
        quoteToken: { address: '0xsol', name: 'SOL', symbol: 'SOL' },
        priceNative: '0.01',
        priceUsd: '1.50',
        txns: {
          m5: { buys: 0, sells: 0 },
          h1: { buys: 0, sells: 0 },
          h6: { buys: 0, sells: 0 },
          h24: { buys: 100, sells: 50 },
        },
        volume: { m5: 0, h1: 0, h6: 0, h24: 200000 },
        priceChange: { m5: 0, h1: 0, h6: 0, h24: 25 },
        liquidity: { usd: 500000, base: 100, quote: 50 },
        fdv: 10000000,
        marketCap: 5000000,
        pairCreatedAt: null,
      },
    ]);
    // CoinGecko trending
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        coins: [{ item: { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', market_cap_rank: 1 } }],
      }),
    });

    const result = await fetchTrendingTokens();

    expect(result.length).toBe(2);
    expect(result[0]!.symbol).toBe('MOON');
    expect(result[0]!.source).toBe('dexscreener');
    expect(result[1]!.symbol).toBe('BTC');
    expect(result[1]!.source).toBe('coingecko');
  });

  it('returns DexScreener results when CoinGecko fails', async () => {
    mockGetTopBoostedTokens.mockResolvedValueOnce([
      { chainId: 'ethereum', tokenAddress: '0xtoken', amount: 50, totalAmount: 200 },
    ]);
    mockDexSearch.mockResolvedValueOnce([
      {
        chainId: 'ethereum',
        dexId: 'uniswap',
        pairAddress: '0xpair',
        url: 'https://dexscreener.com/ethereum/0xpair',
        baseToken: { address: '0xtoken', name: 'TestToken', symbol: 'TEST' },
        quoteToken: { address: '0xweth', name: 'WETH', symbol: 'WETH' },
        priceNative: '0.001',
        priceUsd: '3.00',
        txns: {
          m5: { buys: 0, sells: 0 },
          h1: { buys: 0, sells: 0 },
          h6: { buys: 0, sells: 0 },
          h24: { buys: 10, sells: 5 },
        },
        volume: { m5: 0, h1: 0, h6: 0, h24: 50000 },
        priceChange: { m5: 0, h1: 0, h6: 0, h24: 10 },
        liquidity: { usd: 100000, base: 50, quote: 25 },
        fdv: null,
        marketCap: null,
        pairCreatedAt: null,
      },
    ]);
    mockFetch.mockRejectedValueOnce(new Error('CoinGecko down'));

    const result = await fetchTrendingTokens();

    expect(result.length).toBe(1);
    expect(result[0]!.source).toBe('dexscreener');
  });

  it('returns CoinGecko results when DexScreener fails', async () => {
    mockGetTopBoostedTokens.mockRejectedValueOnce(new Error('DexScreener down'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        coins: [{ item: { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', market_cap_rank: 2 } }],
      }),
    });

    const result = await fetchTrendingTokens();

    expect(result.length).toBe(1);
    expect(result[0]!.symbol).toBe('ETH');
    expect(result[0]!.source).toBe('coingecko');
  });

  it('returns empty array when all sources fail', async () => {
    mockGetTopBoostedTokens.mockRejectedValueOnce(new Error('DexScreener down'));
    mockFetch.mockRejectedValueOnce(new Error('CoinGecko down'));

    const result = await fetchTrendingTokens();

    expect(result).toEqual([]);
  });

  it('deduplicates DexScreener boosted tokens by chain:address', async () => {
    mockGetTopBoostedTokens.mockResolvedValueOnce([
      { chainId: 'solana', tokenAddress: '0xabc', amount: 100, totalAmount: 500 },
      { chainId: 'solana', tokenAddress: '0xabc', amount: 50, totalAmount: 500 }, // duplicate
    ]);
    mockDexSearch.mockResolvedValue([
      {
        chainId: 'solana',
        dexId: 'raydium',
        pairAddress: '0xpair',
        url: 'https://dexscreener.com/solana/0xpair',
        baseToken: { address: '0xabc', name: 'Token', symbol: 'TKN' },
        quoteToken: { address: '0xsol', name: 'SOL', symbol: 'SOL' },
        priceNative: '0.01',
        priceUsd: '1.00',
        txns: {
          m5: { buys: 0, sells: 0 },
          h1: { buys: 0, sells: 0 },
          h6: { buys: 0, sells: 0 },
          h24: { buys: 10, sells: 5 },
        },
        volume: { m5: 0, h1: 0, h6: 0, h24: 10000 },
        priceChange: { m5: 0, h1: 0, h6: 0, h24: 5 },
        liquidity: { usd: 50000, base: 100, quote: 50 },
        fdv: null,
        marketCap: null,
        pairCreatedAt: null,
      },
    ]);
    // CoinGecko
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ coins: [] }),
    });

    const result = await fetchTrendingTokens();

    // Should only have 1 token, not 2
    const dexResults = result.filter((r) => r.source === 'dexscreener');
    expect(dexResults.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// analyzeTrend (rule-based)
// ---------------------------------------------------------------------------

describe('analyzeTrend', () => {
  it('detects bullish trend with strong price gains', () => {
    const result = analyzeTrend({
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 67000,
      priceChange24h: 8,
      priceChange7d: 15,
      volume24h: 50000000000,
      marketCap: 1300000000000,
      rank: 1,
    });

    expect(result.direction).toBe('bullish');
    expect(result.strength).toBeGreaterThan(60);
    expect(result.signals.some((s) => s.includes('Strong 24h gain'))).toBe(true);
    expect(result.signals.some((s) => s.includes('Bullish weekly trend'))).toBe(true);
  });

  it('detects bearish trend with significant price drops', () => {
    const result = analyzeTrend({
      symbol: 'ETH',
      name: 'Ethereum',
      price: 2800,
      priceChange24h: -8,
      priceChange7d: -15,
      volume24h: 20000000000,
      marketCap: 340000000000,
      rank: 2,
    });

    expect(result.direction).toBe('bearish');
    expect(result.strength).toBeLessThan(40);
    expect(result.signals.some((s) => s.includes('Significant 24h drop'))).toBe(true);
    expect(result.signals.some((s) => s.includes('Bearish weekly trend'))).toBe(true);
  });

  it('detects neutral trend with small price changes', () => {
    const result = analyzeTrend({
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 67000,
      priceChange24h: 1,
      priceChange7d: 2,
      volume24h: 30000000000,
      marketCap: 1300000000000,
      rank: 1,
    });

    expect(result.direction).toBe('neutral');
    expect(result.strength).toBe(50);
    expect(result.signals.length).toBe(0);
  });

  it('adds high volume signal when volume > 10% of market cap', () => {
    const result = analyzeTrend({
      symbol: 'MEME',
      name: 'MemeCoin',
      price: 0.01,
      priceChange24h: 1,
      priceChange7d: 2,
      volume24h: 2000000,
      marketCap: 10000000,
      rank: 500,
    });

    expect(result.signals.some((s) => s.includes('High volume'))).toBe(true);
  });

  it('clamps strength to 0-100 range', () => {
    // Very bearish scenario
    const bearish = analyzeTrend({
      symbol: 'X',
      name: 'X',
      price: 1,
      priceChange24h: -50,
      priceChange7d: -70,
      volume24h: 0,
      marketCap: 100,
      rank: null,
    });
    expect(bearish.strength).toBeGreaterThanOrEqual(0);
    expect(bearish.strength).toBeLessThanOrEqual(100);

    // Very bullish scenario
    const bullish = analyzeTrend({
      symbol: 'X',
      name: 'X',
      price: 1,
      priceChange24h: 50,
      priceChange7d: 70,
      volume24h: 50,
      marketCap: 100,
      rank: null,
    });
    expect(bullish.strength).toBeGreaterThanOrEqual(0);
    expect(bullish.strength).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// analyzeTrendML
// ---------------------------------------------------------------------------

describe('analyzeTrendML', () => {
  const marketData = {
    symbol: 'BTC',
    name: 'Bitcoin',
    price: 67000,
    priceChange24h: 5,
    priceChange7d: 12,
    volume24h: 45000000000,
    marketCap: 1300000000000,
    rank: 1,
  };

  it('uses ML client when available', async () => {
    const mlClient = { scoreTrend: mockScoreTrend };
    mockGetMLClient.mockReturnValue(mlClient);
    mockScoreTrend.mockResolvedValueOnce({
      score: 78,
      direction: 'bullish',
      confidence: 85,
      feature_importances: { price_change_7d: 0.4, volume_24h: 0.3 },
      model: 'trend-xgboost-v1',
    });

    const result = await analyzeTrendML(marketData);

    expect(mockScoreTrend).toHaveBeenCalledWith({
      price_change_24h: 5,
      price_change_7d: 12,
      volume_24h: 45000000000,
      market_cap: 1300000000000,
      volume_to_mcap_ratio: 45000000000 / 1300000000000,
      rank: 1,
    });
    expect(result.direction).toBe('bullish');
    expect(result.strength).toBe(78);
    expect(result.signals.some((s) => s.includes('ML trend score'))).toBe(true);
    expect(result.signals.some((s) => s.includes('Top driver: price_change_7d'))).toBe(true);
  });

  it('falls back to rule-based when ML client is null', async () => {
    mockGetMLClient.mockReturnValue(null);

    const result = await analyzeTrendML(marketData);

    // Falls back to analyzeTrend which has different signal format
    expect(result.direction).toBeDefined();
    expect(['bullish', 'bearish', 'neutral']).toContain(result.direction);
    expect(result.signals.every((s) => !s.includes('ML trend score'))).toBe(true);
  });

  it('falls back to rule-based when ML client returns null', async () => {
    const mlClient = { scoreTrend: mockScoreTrend };
    mockGetMLClient.mockReturnValue(mlClient);
    mockScoreTrend.mockResolvedValueOnce(null);

    const result = await analyzeTrendML(marketData);

    expect(result.signals.every((s) => !s.includes('ML trend score'))).toBe(true);
  });

  it('falls back to rule-based when ML client throws', async () => {
    const mlClient = { scoreTrend: mockScoreTrend };
    mockGetMLClient.mockReturnValue(mlClient);
    mockScoreTrend.mockRejectedValueOnce(new Error('ML sidecar down'));

    const result = await analyzeTrendML(marketData);

    expect(result.direction).toBeDefined();
    expect(result.signals.every((s) => !s.includes('ML trend score'))).toBe(true);
  });

  it('handles zero market cap in volume_to_mcap_ratio', async () => {
    const mlClient = { scoreTrend: mockScoreTrend };
    mockGetMLClient.mockReturnValue(mlClient);
    mockScoreTrend.mockResolvedValueOnce({
      score: 50,
      direction: 'neutral',
      confidence: 60,
      feature_importances: {},
      model: 'trend-v1',
    });

    const zeroMcapData = { ...marketData, marketCap: 0 };
    await analyzeTrendML(zeroMcapData);

    expect(mockScoreTrend).toHaveBeenCalledWith(
      expect.objectContaining({ volume_to_mcap_ratio: 0 }),
    );
  });
});
