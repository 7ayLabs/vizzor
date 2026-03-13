// ---------------------------------------------------------------------------
// Context injector — pre-fetches real-time data for providers without tool use
// (e.g. Ollama). Injects data as context into the system prompt so the AI
// can answer with current information instead of stale training data.
// ---------------------------------------------------------------------------

import { fetchMarketData, fetchTokenFromDex, fetchTrendingTokens } from '../core/trends/market.js';
import { fetchCryptoNews } from '../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../data/sources/defillama.js';
import { fetchLatestCoins } from '../data/sources/pumpfun.js';
import { fetchTickerPrice, fetchFundingRate, fetchOpenInterest } from '../data/sources/binance.js';
import { fetchFearGreedIndex } from '../data/sources/fear-greed.js';
import { getConfig } from '../config/loader.js';
import { KNOWN_SYMBOLS } from '../config/constants.js';

// ---------------------------------------------------------------------------
// Keyword patterns for detecting user intent
// ---------------------------------------------------------------------------

const PRICE_KEYWORDS = ['price', 'worth', 'cost', 'value', 'how much'];
const TRENDING_KEYWORDS = ['trending', 'hot', 'popular', 'top', 'best', 'hype'];
const NEWS_KEYWORDS = ['news', 'latest', 'update', 'happening', 'announcement'];
const RAISES_KEYWORDS = [
  'ico',
  'ido',
  'launch',
  'raise',
  'funding',
  'fundrais',
  'invest',
  'new project',
];
const PUMP_KEYWORDS = ['pump', 'meme', 'solana launch', 'pump.fun', 'degen'];
const BROAD_KEYWORDS = [
  "what's happening",
  'whats happening',
  'market',
  'overview',
  'summary',
  'up to date',
  'up-to-date',
  'current',
  'right now',
  'today',
  '2025',
  '2026',
  'lately',
  'recently',
  'this week',
  'this month',
  'general',
  'everything',
  'outlook',
  'sentiment',
  'macro',
  'state of',
  'tell me about crypto',
  'crypto market',
];

// KNOWN_SYMBOLS is now imported from config/constants.ts

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Build a context block with real-time data based on the user's message.
 * Returns a string to prepend to the system prompt, or empty string if
 * no relevant data was found.
 */
export async function buildContextBlock(userMessage: string): Promise<string> {
  const lower = userMessage.toLowerCase();
  const sections: string[] = [];

  // Detect 0x addresses
  const addressMatch = userMessage.match(/0x[a-fA-F0-9]{40}/);

  // Detect token mentions
  const mentionedTokens = detectTokens(lower);

  // Run relevant fetches in parallel
  const tasks: Promise<void>[] = [];

  // 1. Price / token data
  if (mentionedTokens.length > 0 || addressMatch || matchesAny(lower, PRICE_KEYWORDS)) {
    tasks.push(
      fetchTokenData(mentionedTokens, addressMatch?.[0]).then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // 2. Trending
  if (matchesAny(lower, TRENDING_KEYWORDS)) {
    tasks.push(
      fetchTrendingData().then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // 3. News
  if (matchesAny(lower, NEWS_KEYWORDS)) {
    const symbol = mentionedTokens[0]?.toUpperCase();
    tasks.push(
      fetchNewsData(symbol).then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // 4. Raises / ICOs
  if (matchesAny(lower, RAISES_KEYWORDS)) {
    tasks.push(
      fetchRaisesData().then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // 5. Pump.fun / meme coins
  if (matchesAny(lower, PUMP_KEYWORDS)) {
    tasks.push(
      fetchPumpData().then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // 6. Broad / general query — fetch everything for a full picture
  const isBroadQuery = matchesAny(lower, BROAD_KEYWORDS);
  if (isBroadQuery) {
    // Inject trending if not already queued
    if (!matchesAny(lower, TRENDING_KEYWORDS)) {
      tasks.push(
        fetchTrendingData().then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
    // Inject news if not already queued
    if (!matchesAny(lower, NEWS_KEYWORDS)) {
      tasks.push(
        fetchNewsData().then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
    // Inject raises if not already queued
    if (!matchesAny(lower, RAISES_KEYWORDS)) {
      tasks.push(
        fetchRaisesData().then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
    // Inject top 3 market data if not already queued
    if (!matchesAny(lower, PRICE_KEYWORDS) && mentionedTokens.length === 0 && !addressMatch) {
      tasks.push(
        fetchTokenData(['bitcoin', 'ethereum', 'solana']).then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
  }

  // If no specific intent detected, try to fetch market data for any mentioned tokens
  if (tasks.length === 0 && mentionedTokens.length > 0) {
    tasks.push(
      fetchTokenData(mentionedTokens).then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // If still no tasks, inject baseline context (trending + news) so Ollama never hallucinates
  if (tasks.length === 0) {
    tasks.push(
      fetchTrendingData().then((data) => {
        if (data) sections.push(data);
      }),
    );
    tasks.push(
      fetchNewsData().then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // Always inject market sentiment (Fear & Greed) + top-3 Binance prices for baseline accuracy
  tasks.push(
    fetchFearGreedData().then((data) => {
      if (data) sections.push(data);
    }),
  );
  tasks.push(
    fetchBinancePriceData(['BTC', 'ETH', 'SOL']).then((data) => {
      if (data) sections.push(data);
    }),
  );

  // Inject derivatives data for broad or price queries
  if (isBroadQuery || matchesAny(lower, PRICE_KEYWORDS) || mentionedTokens.length > 0) {
    tasks.push(
      fetchDerivativesData(mentionedTokens).then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  await Promise.allSettled(tasks);

  if (sections.length === 0) return '';

  return [
    '',
    '--- REAL-TIME DATA (fetched just now) ---',
    ...sections,
    '--- END REAL-TIME DATA ---',
    '',
    'CRITICAL INSTRUCTIONS:',
    '- You MUST use ONLY the real-time data above to answer. Do NOT invent, hallucinate, or fabricate any data, news, events, or prices.',
    '- If a piece of information is not in the data above, say "I don\'t have data on that right now" — do NOT make something up.',
    '- Cite specific numbers, sources (Binance, CoinGecko, DexScreener, CryptoPanic, DeFiLlama, GoPlus), and mention this is live data.',
    '- Your training data is STALE and OUTDATED. The ONLY trustworthy information is what appears between the REAL-TIME DATA markers above.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchTokenData(tokens: string[], address?: string): Promise<string | null> {
  const lines: string[] = ['## Token / Price Data'];

  // Fetch by address via DexScreener
  if (address) {
    try {
      const pairs = await fetchTokenFromDex(address);
      const pair = pairs[0];
      if (pair) {
        lines.push(
          `${pair.baseToken.name} (${pair.baseToken.symbol}) on ${pair.chainId}:`,
          `  Price: $${pair.priceUsd ?? '?'}`,
          `  24h Volume: $${(pair.volume?.h24 ?? 0).toLocaleString()}`,
          `  Liquidity: $${(pair.liquidity?.usd ?? 0).toLocaleString()}`,
          `  24h Change: ${(pair.priceChange?.h24 ?? 0) > 0 ? '+' : ''}${(pair.priceChange?.h24 ?? 0).toFixed(2)}%`,
          `  24h Txns: ${pair.txns?.h24?.buys ?? 0} buys / ${pair.txns?.h24?.sells ?? 0} sells`,
          `  Market Cap: $${(pair.marketCap ?? pair.fdv ?? 0).toLocaleString()}`,
          `  DEX: ${pair.dexId} | Pair: ${pair.pairAddress}`,
          '',
        );
      }
    } catch {
      // skip
    }
  }

  // Fetch named tokens: Binance (primary) -> CoinGecko (fallback) -> DexScreener (fallback)
  for (const token of tokens.slice(0, 3)) {
    const sym =
      token === 'bitcoin'
        ? 'BTC'
        : token === 'ethereum'
          ? 'ETH'
          : token === 'solana'
            ? 'SOL'
            : token.toUpperCase();

    // Try Binance first (most reliable, no rate limits)
    try {
      const binanceData = await fetchTickerPrice(sym);
      if (binanceData) {
        lines.push(
          `${sym} (via Binance):`,
          `  Price: $${binanceData.price.toLocaleString()}`,
          `  24h Change: ${binanceData.change24h > 0 ? '+' : ''}${binanceData.change24h.toFixed(2)}%`,
        );
        // Also try CoinGecko for extended data (market cap, rank, 7d)
        const geckoId = KNOWN_SYMBOLS[token];
        if (geckoId) {
          try {
            const gecko = await fetchMarketData(geckoId);
            if (gecko) {
              lines.push(
                `  7d Change: ${gecko.priceChange7d > 0 ? '+' : ''}${gecko.priceChange7d.toFixed(2)}%`,
                `  24h Volume: $${gecko.volume24h.toLocaleString()}`,
                `  Market Cap: $${gecko.marketCap.toLocaleString()}`,
                `  Rank: #${gecko.rank ?? '?'}`,
              );
            }
          } catch {
            // CoinGecko unavailable, continue with Binance data only
          }
        }
        lines.push('');
        continue;
      }
    } catch {
      // Binance unavailable, fall through
    }

    // Fallback to CoinGecko
    const geckoId = KNOWN_SYMBOLS[token];
    if (geckoId) {
      try {
        const data = await fetchMarketData(geckoId);
        if (data) {
          lines.push(
            `${data.name} (${data.symbol}):`,
            `  Price: $${data.price.toLocaleString()}`,
            `  24h Change: ${data.priceChange24h > 0 ? '+' : ''}${data.priceChange24h.toFixed(2)}%`,
            `  7d Change: ${data.priceChange7d > 0 ? '+' : ''}${data.priceChange7d.toFixed(2)}%`,
            `  24h Volume: $${data.volume24h.toLocaleString()}`,
            `  Market Cap: $${data.marketCap.toLocaleString()}`,
            `  Rank: #${data.rank ?? '?'}`,
            '',
          );
          continue;
        }
      } catch {
        // fall through to DexScreener
      }
    }

    // Final fallback: DexScreener for tokens not on Binance/CoinGecko
    try {
      const pairs = await fetchTokenFromDex(token);
      const pair = pairs[0];
      if (pair) {
        lines.push(
          `${pair.baseToken.name} (${pair.baseToken.symbol}) on ${pair.chainId}:`,
          `  Price: $${pair.priceUsd ?? '?'}`,
          `  24h Volume: $${(pair.volume?.h24 ?? 0).toLocaleString()}`,
          `  24h Change: ${(pair.priceChange?.h24 ?? 0) > 0 ? '+' : ''}${(pair.priceChange?.h24 ?? 0).toFixed(2)}%`,
          '',
        );
      }
    } catch {
      // skip
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

async function fetchTrendingData(): Promise<string | null> {
  try {
    const trending = await fetchTrendingTokens();
    if (trending.length === 0) return null;

    const lines = ['## Trending Tokens (live)'];
    for (const t of trending.slice(0, 10)) {
      lines.push(
        `- ${t.name} (${t.symbol}) on ${t.chain}: $${t.priceUsd} | 24h: ${t.priceChange24h > 0 ? '+' : ''}${t.priceChange24h.toFixed(1)}% | Vol: $${t.volume24h.toLocaleString()} [${t.source}]`,
      );
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

async function fetchNewsData(symbol?: string): Promise<string | null> {
  try {
    const news = await fetchCryptoNews(symbol, getConfig().cryptopanicApiKey);
    if (news.length === 0) return null;

    const lines = [`## Latest Crypto News${symbol ? ` (${symbol})` : ''}`];
    for (const n of news.slice(0, 8)) {
      lines.push(
        `- [${n.sentiment.toUpperCase()}] ${n.title} (${n.source.title}, ${n.publishedAt})`,
      );
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

async function fetchRaisesData(): Promise<string | null> {
  try {
    const raises = await fetchRecentRaises(30);
    if (raises.length === 0) return null;

    const lines = ['## Recent Crypto Fundraising Rounds (last 30 days)'];
    for (const r of raises.slice(0, 10)) {
      const amount = r.amount ? `$${(r.amount / 1e6).toFixed(1)}M` : 'undisclosed';
      const date = new Date(r.date * 1000).toISOString().split('T')[0];
      lines.push(
        `- ${r.name} — ${r.round} (${amount}) on ${r.chains.join(', ') || 'multi-chain'} [${date}]${r.leadInvestors.length > 0 ? ` Led by: ${r.leadInvestors.join(', ')}` : ''}`,
      );
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

async function fetchPumpData(): Promise<string | null> {
  try {
    const coins = await fetchLatestCoins(10);
    if (coins.length === 0) return null;

    const lines = ['## Latest Pump.fun Launches (Solana)'];
    for (const c of coins) {
      const mcap = c.usd_market_cap ? `$${c.usd_market_cap.toFixed(0)}` : '?';
      lines.push(`- ${c.name} (${c.symbol}) — MC: ${mcap} | Replies: ${c.reply_count}`);
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// New data fetchers (Binance, Fear & Greed, Derivatives)
// ---------------------------------------------------------------------------

async function fetchBinancePriceData(symbols: string[]): Promise<string | null> {
  try {
    const results = await Promise.allSettled(symbols.map((s) => fetchTickerPrice(s)));
    const lines: string[] = ['## Live Prices (Binance, real-time)'];
    let hasData = false;

    for (let i = 0; i < symbols.length; i++) {
      const result = results[i];
      if (result && result.status === 'fulfilled') {
        const d = result.value;
        lines.push(
          `${d.symbol}: $${d.price.toLocaleString()} | 24h: ${d.change24h > 0 ? '+' : ''}${d.change24h.toFixed(2)}%`,
        );
        hasData = true;
      }
    }

    return hasData ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

async function fetchFearGreedData(): Promise<string | null> {
  try {
    const data = await fetchFearGreedIndex(7);
    const c = data.current;
    const lines = [
      `## Market Sentiment (Fear & Greed Index)`,
      `Current: ${c.value}/100 (${c.classification})`,
    ];
    if (data.previous) {
      lines.push(`Previous: ${data.previous.value}/100 (${data.previous.classification})`);
    }
    if (data.history.length > 2) {
      const weekAgo = data.history[data.history.length - 1];
      if (weekAgo) {
        lines.push(`7d ago: ${weekAgo.value}/100 (${weekAgo.classification})`);
      }
    }
    return lines.join('\n');
  } catch {
    return null;
  }
}

async function fetchDerivativesData(tokens: string[]): Promise<string | null> {
  const symbols =
    tokens.length > 0
      ? tokens.slice(0, 3).map((t) => {
          // Convert geckoId-style names to ticker symbols
          if (t === 'bitcoin' || t === 'btc') return 'BTC';
          if (t === 'ethereum' || t === 'eth') return 'ETH';
          if (t === 'solana' || t === 'sol') return 'SOL';
          return t.toUpperCase();
        })
      : ['BTC', 'ETH'];

  try {
    const lines: string[] = ['## Derivatives Data (Binance Futures)'];
    let hasData = false;

    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        const [funding, oi] = await Promise.allSettled([
          fetchFundingRate(sym),
          fetchOpenInterest(sym),
        ]);
        return { sym, funding, oi };
      }),
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { sym, funding, oi } = result.value;

      const parts: string[] = [`${sym}:`];
      if (funding.status === 'fulfilled') {
        const f = funding.value;
        parts.push(`Funding: ${(f.fundingRate * 100).toFixed(4)}%`);
        parts.push(`Mark: $${f.markPrice.toLocaleString()}`);
      }
      if (oi.status === 'fulfilled') {
        const o = oi.value;
        parts.push(`OI: $${(o.notionalValue / 1e9).toFixed(2)}B`);
      }
      if (parts.length > 1) {
        lines.push(`  ${parts.join(' | ')}`);
        hasData = true;
      }
    }

    return hasData ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function detectTokens(lower: string): string[] {
  const found: string[] = [];
  for (const key of Object.keys(KNOWN_SYMBOLS)) {
    // Match whole word
    const regex = new RegExp(`\\b${key}\\b`);
    if (regex.test(lower) && !found.includes(key)) {
      found.push(key);
    }
  }
  return found;
}
