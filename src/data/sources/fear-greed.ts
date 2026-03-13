// ---------------------------------------------------------------------------
// Fear & Greed Index — alternative.me API, no auth required
// https://alternative.me/crypto/fear-and-greed-index/
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.alternative.me/fng';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FearGreedEntry {
  value: number;
  classification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
  timestamp: number;
}

export interface FearGreedData {
  current: FearGreedEntry;
  previous: FearGreedEntry | null;
  history: FearGreedEntry[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fear & Greed API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function parseClassification(value: number): FearGreedEntry['classification'] {
  if (value <= 20) return 'Extreme Fear';
  if (value <= 40) return 'Fear';
  if (value <= 60) return 'Neutral';
  if (value <= 80) return 'Greed';
  return 'Extreme Greed';
}

/**
 * Fetch the current Fear & Greed Index along with recent history.
 */
export async function fetchFearGreedIndex(days = 7): Promise<FearGreedData> {
  const data = await fetchJson<{
    data: { value: string; value_classification: string; timestamp: string }[];
  }>(`${BASE_URL}/?limit=${days}&format=json`);

  const entries: FearGreedEntry[] = (data.data ?? []).map((d) => {
    const value = parseInt(d.value, 10);
    return {
      value,
      classification: parseClassification(value),
      timestamp: parseInt(d.timestamp, 10),
    };
  });

  return {
    current: entries[0] ?? { value: 50, classification: 'Neutral', timestamp: Date.now() / 1000 },
    previous: entries[1] ?? null,
    history: entries,
  };
}
