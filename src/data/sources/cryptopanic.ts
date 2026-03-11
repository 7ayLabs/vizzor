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
  // CryptoPanic requires auth_token even for free tier.
  // If no token provided, return empty rather than erroring.
  if (!apiToken) {
    return [];
  }

  const params = new URLSearchParams({ auth_token: apiToken });
  if (symbol) {
    params.set('currencies', symbol.toUpperCase());
  }

  const url = `${BASE_URL}/posts/?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CryptoPanic API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { results: RawPost[] };
  const posts = data.results ?? [];

  return posts.map((post): CryptoNews => {
    // Derive sentiment from vote counts
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
