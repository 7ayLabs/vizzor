import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFearGreedIndex } from '@/data/sources/fear-greed.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchFearGreedIndex', () => {
  it('returns current fear & greed data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { value: '25', value_classification: 'Fear', timestamp: '1700000000' },
          { value: '30', value_classification: 'Fear', timestamp: '1699913600' },
        ],
      }),
    });

    const result = await fetchFearGreedIndex(2);
    expect(result.current.value).toBe(25);
    expect(result.current.classification).toBe('Fear');
    expect(result.previous).not.toBeNull();
    expect(result.previous!.value).toBe(30);
    expect(result.history).toHaveLength(2);
  });

  it('classifies extreme fear (0-20)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ value: '10', value_classification: 'Extreme Fear', timestamp: '1700000000' }],
      }),
    });

    const result = await fetchFearGreedIndex(1);
    expect(result.current.classification).toBe('Extreme Fear');
  });

  it('classifies greed (61-80)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ value: '72', value_classification: 'Greed', timestamp: '1700000000' }],
      }),
    });

    const result = await fetchFearGreedIndex(1);
    expect(result.current.classification).toBe('Greed');
  });

  it('classifies extreme greed (81-100)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ value: '90', value_classification: 'Extreme Greed', timestamp: '1700000000' }],
      }),
    });

    const result = await fetchFearGreedIndex(1);
    expect(result.current.classification).toBe('Extreme Greed');
  });

  it('classifies neutral (41-60)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ value: '50', value_classification: 'Neutral', timestamp: '1700000000' }],
      }),
    });

    const result = await fetchFearGreedIndex(1);
    expect(result.current.classification).toBe('Neutral');
  });

  it('handles empty data gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const result = await fetchFearGreedIndex(1);
    expect(result.current.value).toBe(50);
    expect(result.current.classification).toBe('Neutral');
    expect(result.previous).toBeNull();
  });

  it('throws on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchFearGreedIndex(1)).rejects.toThrow('Fear & Greed API error');
  });
});
