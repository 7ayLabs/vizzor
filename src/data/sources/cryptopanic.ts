// ---------------------------------------------------------------------------
// CryptoPanic API client — crypto news with sentiment
// https://cryptopanic.com/developers/api/
// ---------------------------------------------------------------------------

const BASE_URL = 'https://cryptopanic.com/api/free/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CryptoNews {
  id: number;
  title: string;
  url: string;
  source: { title: string; domain: string };
  sentiment: 'positive' | 'negative' | 'neutral';
  currencies: { code: string; title: string }[];
  publishedAt: string;
  kind: 'news' | 'media';
}

interface RawPost {
  id: number;
  title: string;
  url: string;
  source: { title: string; domain: string };
  votes: { positive: number; negative: number; important: number };
  currencies?: { code: string; title: string }[];
  published_at: string;
  kind: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch latest crypto news, optionally filtered by currency symbol.
 * If an API token is provided, uses authenticated endpoint for better filtering.
 */
export async function fetchCryptoNews(symbol?: string, apiToken?: string): Promise<CryptoNews[]> {
  // Try CryptoPanic first (if token available), then fall back to CryptoCompare
  if (apiToken) {
    const results = await fetchFromCryptoPanic(symbol, apiToken);
    if (results.length > 0) return results;
  }

  // Fallback: CryptoCompare free news API (no key required)
  return fetchFromCryptoCompare(symbol);
}

async function fetchFromCryptoPanic(symbol?: string, apiToken?: string): Promise<CryptoNews[]> {
  if (!apiToken) return [];

  const params = new URLSearchParams({ auth_token: apiToken });
  if (symbol) {
    params.set('currencies', symbol.toUpperCase());
  }

  const url = `${BASE_URL}/posts/?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) return [];

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return [];

  let data: { results: RawPost[] };
  try {
    data = (await res.json()) as { results: RawPost[] };
  } catch {
    return [];
  }
  const posts = data.results ?? [];

  return posts.map((post): CryptoNews => {
    const { positive, negative } = post.votes;
    let sentiment: CryptoNews['sentiment'] = 'neutral';
    if (positive > negative * 2) sentiment = 'positive';
    else if (negative > positive * 2) sentiment = 'negative';

    return {
      id: post.id,
      title: post.title,
      url: post.url,
      source: post.source,
      sentiment,
      currencies: post.currencies ?? [],
      publishedAt: post.published_at,
      kind: post.kind === 'media' ? 'media' : 'news',
    };
  });
}

// ---------------------------------------------------------------------------
// CoinGecko News fallback — free, no API key required
// https://api.coingecko.com/api/v3/news
// ---------------------------------------------------------------------------

interface CoinGeckoNewsItem {
  id: number;
  title: string;
  description: string;
  url: string;
  news_site: string;
  created_at: number; // unix timestamp
  thumb_2x?: string;
}

async function fetchFromCryptoCompare(_symbol?: string): Promise<CryptoNews[]> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/news?page=1');
    if (!res.ok) return [];

    const data = (await res.json()) as { data?: CoinGeckoNewsItem[] };
    const items = data.data ?? [];

    return items.slice(0, 20).map(
      (item): CryptoNews => ({
        id: item.id,
        title: item.title,
        url: item.url,
        source: { title: item.news_site, domain: item.news_site },
        sentiment: 'neutral',
        currencies: [],
        publishedAt: new Date(item.created_at * 1000).toISOString(),
        kind: 'news',
      }),
    );
  } catch {
    return [];
  }
}
