// ---------------------------------------------------------------------------
// Context injector — pre-fetches real-time data for providers without tool use
// (e.g. Ollama). Injects data as context into the system prompt so the AI
// can answer with current information instead of stale training data.
// ---------------------------------------------------------------------------

import { fetchMarketData, fetchTokenFromDex, fetchTrendingTokens } from '../core/trends/market.js';
import { fetchCryptoNews } from '../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../data/sources/defillama.js';
import { fetchLatestCoins } from '../data/sources/pumpfun.js';
import { getConfig } from '../config/loader.js';

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

// Common token symbols to recognize
const KNOWN_SYMBOLS: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  bnb: 'binancecoin',
  bsc: 'binancecoin',
  xrp: 'ripple',
  ripple: 'ripple',
  ada: 'cardano',
  cardano: 'cardano',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  dot: 'polkadot',
  polkadot: 'polkadot',
  avax: 'avalanche-2',
  avalanche: 'avalanche-2',
  matic: 'matic-network',
  polygon: 'matic-network',
  link: 'chainlink',
  chainlink: 'chainlink',
  uni: 'uniswap',
  uniswap: 'uniswap',
  atom: 'cosmos',
  cosmos: 'cosmos',
  near: 'near',
  arb: 'arbitrum',
  op: 'optimism',
  sui: 'sui',
  apt: 'aptos',
  pepe: 'pepe',
  shib: 'shiba-inu',
  floki: 'floki',
  bonk: 'bonk',
  wif: 'dogwifcoin',
};

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
    '- Cite specific numbers, sources (CoinGecko, DexScreener, CryptoPanic, DeFiLlama), and mention this is live data.',
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

  // Fetch named tokens from CoinGecko + DexScreener
  for (const token of tokens.slice(0, 3)) {
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

    // Try DexScreener for tokens not on CoinGecko
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
