import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchTokens,
  getTokenPairs,
  getLatestBoostedTokens,
  getTopBoostedTokens,
  getLatestTokenProfiles,
  getPair,
} from '@/data/sources/dexscreener.js';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helper: create mock DexPair data
// ---------------------------------------------------------------------------

function makePair(overrides: Record<string, unknown> = {}) {
  return {
    chainId: 'ethereum',
    dexId: 'uniswap',
    pairAddress: '0xpair123',
    url: 'https://dexscreener.com/ethereum/0xpair123',
    baseToken: { address: '0xtoken', name: 'TestToken', symbol: 'TEST' },
    quoteToken: { address: '0xweth', name: 'WETH', symbol: 'WETH' },
    priceNative: '0.001',
    priceUsd: '3.50',
    txns: {
      m5: { buys: 5, sells: 3 },
      h1: { buys: 50, sells: 30 },
      h6: { buys: 300, sells: 200 },
      h24: { buys: 1200, sells: 800 },
    },
    volume: { m5: 1000, h1: 50000, h6: 300000, h24: 1200000 },
    priceChange: { m5: 0.5, h1: 2.0, h6: 5.0, h24: 12.5 },
    liquidity: { usd: 500000, base: 142857, quote: 250 },
    fdv: 10000000,
    marketCap: 5000000,
    pairCreatedAt: 1700000000000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// searchTokens
// ---------------------------------------------------------------------------

describe('searchTokens', () => {
  it('returns pairs matching query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: [makePair()] }),
    });

    const result = await searchTokens('TEST');

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/latest/dex/search?q=TEST'));
    expect(result.length).toBe(1);
    expect(result[0]!.baseToken.symbol).toBe('TEST');
    expect(result[0]!.priceUsd).toBe('3.50');
  });

  it('returns empty array when no pairs found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: null }),
    });

    const result = await searchTokens('NONEXISTENT');

    expect(result).toEqual([]);
  });

  it('encodes query parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: [] }),
    });

    await searchTokens('0x1234 test');

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=0x1234%20test'));
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(searchTokens('TEST')).rejects.toThrow('DexScreener API error');
  });

  it('returns buy/sell transaction counts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pairs: [
          makePair({
            txns: {
              m5: { buys: 10, sells: 5 },
              h1: { buys: 100, sells: 50 },
              h6: { buys: 500, sells: 300 },
              h24: { buys: 2000, sells: 1500 },
            },
          }),
        ],
      }),
    });

    const result = await searchTokens('TOKEN');

    expect(result[0]!.txns.h24.buys).toBe(2000);
    expect(result[0]!.txns.h24.sells).toBe(1500);
    expect(result[0]!.txns.m5.buys).toBe(10);
  });

  it('returns multiple pairs sorted by relevance', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pairs: [
          makePair({ baseToken: { address: '0xa', name: 'Token A', symbol: 'TOKA' } }),
          makePair({ baseToken: { address: '0xb', name: 'Token B', symbol: 'TOKB' } }),
        ],
      }),
    });

    const result = await searchTokens('TOK');

    expect(result.length).toBe(2);
    expect(result[0]!.baseToken.symbol).toBe('TOKA');
    expect(result[1]!.baseToken.symbol).toBe('TOKB');
  });
});

// ---------------------------------------------------------------------------
// getTokenPairs
// ---------------------------------------------------------------------------

describe('getTokenPairs', () => {
  it('returns pairs for a specific token on chain', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: [makePair()] }),
    });

    const result = await getTokenPairs('ethereum', '0xtoken');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/token-pairs/v1/ethereum/0xtoken'),
    );
    expect(result.length).toBe(1);
  });

  it('returns empty array when no pairs exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: null }),
    });

    const result = await getTokenPairs('solana', '0xunknown');

    expect(result).toEqual([]);
  });

  it('throws on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(getTokenPairs('ethereum', '0xbad')).rejects.toThrow('DexScreener API error');
  });
});

// ---------------------------------------------------------------------------
// getTopBoostedTokens
// ---------------------------------------------------------------------------

describe('getTopBoostedTokens', () => {
  it('returns top boosted tokens', async () => {
    const boosted = [
      {
        url: 'https://dexscreener.com/solana/abc',
        chainId: 'solana',
        tokenAddress: '0xabc',
        amount: 100,
        totalAmount: 500,
        icon: 'https://icon.url',
        description: 'A boosted token',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => boosted,
    });

    const result = await getTopBoostedTokens();

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/token-boosts/top/v1'));
    expect(result.length).toBe(1);
    expect(result[0]!.chainId).toBe('solana');
    expect(result[0]!.totalAmount).toBe(500);
  });

  it('throws on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    await expect(getTopBoostedTokens()).rejects.toThrow('DexScreener API error');
  });
});

// ---------------------------------------------------------------------------
// getLatestBoostedTokens
// ---------------------------------------------------------------------------

describe('getLatestBoostedTokens', () => {
  it('returns latest boosted tokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          url: 'https://dexscreener.com/ethereum/xyz',
          chainId: 'ethereum',
          tokenAddress: '0xxyz',
          amount: 50,
          totalAmount: 200,
        },
      ],
    });

    const result = await getLatestBoostedTokens();

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/token-boosts/latest/v1'));
    expect(result.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getLatestTokenProfiles
// ---------------------------------------------------------------------------

describe('getLatestTokenProfiles', () => {
  it('returns latest token profiles', async () => {
    const profiles = [
      {
        url: 'https://dexscreener.com/ethereum/0xprofile',
        chainId: 'ethereum',
        tokenAddress: '0xprofile',
        icon: 'https://icon.url',
        description: 'An interesting token',
        links: [{ type: 'website', url: 'https://token.xyz' }],
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => profiles,
    });

    const result = await getLatestTokenProfiles();

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/token-profiles/latest/v1'));
    expect(result.length).toBe(1);
    expect(result[0]!.description).toBe('An interesting token');
    expect(result[0]!.links![0]!.url).toBe('https://token.xyz');
  });

  it('throws on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    await expect(getLatestTokenProfiles()).rejects.toThrow('DexScreener API error');
  });
});

// ---------------------------------------------------------------------------
// getPair
// ---------------------------------------------------------------------------

describe('getPair', () => {
  it('returns a specific pair by chain and address', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pairs: [makePair({ pairAddress: '0xspecific' })],
      }),
    });

    const result = await getPair('ethereum', '0xspecific');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/latest/dex/pairs/ethereum/0xspecific'),
    );
    expect(result).not.toBeNull();
    expect(result!.pairAddress).toBe('0xspecific');
  });

  it('returns null when pair not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: null }),
    });

    const result = await getPair('ethereum', '0xnonexistent');

    expect(result).toBeNull();
  });

  it('returns null when pairs array is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: [] }),
    });

    const result = await getPair('ethereum', '0xempty');

    expect(result).toBeNull();
  });

  it('throws on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(getPair('ethereum', '0xbad')).rejects.toThrow('DexScreener API error');
  });
});

// ---------------------------------------------------------------------------
// Empty results handling
// ---------------------------------------------------------------------------

describe('empty results handling', () => {
  it('searchTokens handles empty pairs array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: [] }),
    });

    const result = await searchTokens('NOTHING');

    expect(result).toEqual([]);
  });

  it('getTokenPairs handles empty pairs array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pairs: [] }),
    });

    const result = await getTokenPairs('ethereum', '0xempty');

    expect(result).toEqual([]);
  });
});
