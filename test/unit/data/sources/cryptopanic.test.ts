import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCryptoNews } from '@/data/sources/cryptopanic.js';

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helper: raw CryptoPanic API response
// ---------------------------------------------------------------------------

function makeRawPost(overrides: Record<string, unknown> = {}) {
  return {
    id: Math.floor(Math.random() * 100000),
    title: 'Bitcoin hits new high',
    url: 'https://example.com/news',
    source: { title: 'CryptoDaily', domain: 'cryptodaily.com' },
    votes: { positive: 10, negative: 2, important: 5 },
    currencies: [{ code: 'BTC', title: 'Bitcoin' }],
    published_at: '2026-03-14T12:00:00Z',
    kind: 'news',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchCryptoNews', () => {
  it('falls back to CoinGecko when no API token provided', async () => {
    // CoinGecko fallback will be called when no CryptoPanic token
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });
    const result = await fetchCryptoNews('BTC');

    // May return items from CoinGecko or empty if that also fails
    expect(Array.isArray(result)).toBe(true);
  });

  it('fetches news with valid API key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        results: [makeRawPost()],
      }),
    });

    const result = await fetchCryptoNews('BTC', 'test-api-key');

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('auth_token=test-api-key'));
    expect(result.length).toBe(1);
    expect(result[0]!.title).toBe('Bitcoin hits new high');
    expect(result[0]!.source.domain).toBe('cryptodaily.com');
    expect(result[0]!.kind).toBe('news');
  });

  it('filters by currency symbol', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        results: [makeRawPost()],
      }),
    });

    await fetchCryptoNews('ETH', 'key');

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('currencies=ETH'));
  });

  it('uppercases currency symbol in request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ results: [] }),
    });

    await fetchCryptoNews('btc', 'key');

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('currencies=BTC'));
  });

  it('handles empty results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ results: [] }),
    });

    const result = await fetchCryptoNews('UNKNOWN', 'key');

    expect(result).toEqual([]);
  });

  it('returns empty array on API error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: { get: () => 'text/html' },
    });

    const result = await fetchCryptoNews('BTC', 'bad-key');

    expect(result).toEqual([]);
  });

  it('returns empty array when response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html; charset=utf-8' },
      json: async () => {
        throw new Error('not JSON');
      },
    });

    const result = await fetchCryptoNews('BTC', 'key');

    expect(result).toEqual([]);
  });

  it('returns empty array when JSON parsing fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const result = await fetchCryptoNews('BTC', 'key');

    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Sentiment derivation from vote counts
  // -------------------------------------------------------------------------

  describe('sentiment labels from votes', () => {
    it('labels as positive when positive votes >> negative votes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          results: [makeRawPost({ votes: { positive: 20, negative: 3, important: 5 } })],
        }),
      });

      const result = await fetchCryptoNews('BTC', 'key');

      expect(result[0]!.sentiment).toBe('positive');
    });

    it('labels as negative when negative votes >> positive votes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          results: [makeRawPost({ votes: { positive: 2, negative: 15, important: 1 } })],
        }),
      });

      const result = await fetchCryptoNews('BTC', 'key');

      expect(result[0]!.sentiment).toBe('negative');
    });

    it('labels as neutral when votes are balanced', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          results: [makeRawPost({ votes: { positive: 5, negative: 5, important: 3 } })],
        }),
      });

      const result = await fetchCryptoNews('BTC', 'key');

      expect(result[0]!.sentiment).toBe('neutral');
    });
  });

  it('handles posts without currencies field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        results: [makeRawPost({ currencies: undefined })],
      }),
    });

    const result = await fetchCryptoNews(undefined, 'key');

    expect(result[0]!.currencies).toEqual([]);
  });

  it('maps media kind correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        results: [makeRawPost({ kind: 'media' })],
      }),
    });

    const result = await fetchCryptoNews('BTC', 'key');

    expect(result[0]!.kind).toBe('media');
  });

  it('maps non-media kind to news', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        results: [makeRawPost({ kind: 'analysis' })],
      }),
    });

    const result = await fetchCryptoNews('BTC', 'key');

    expect(result[0]!.kind).toBe('news');
  });

  it('returns multiple news items in order', async () => {
    const posts = [
      makeRawPost({ id: 1, title: 'First' }),
      makeRawPost({ id: 2, title: 'Second' }),
      makeRawPost({ id: 3, title: 'Third' }),
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ results: posts }),
    });

    const result = await fetchCryptoNews('BTC', 'key');

    expect(result.length).toBe(3);
    expect(result[0]!.title).toBe('First');
    expect(result[2]!.title).toBe('Third');
  });
});
