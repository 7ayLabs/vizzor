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
import { checkTokenSecurity, checkAddressSecurity } from '../data/sources/goplus.js';
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
const ANALYSIS_KEYWORDS = [
  'anali', // analyze, analysis, analize (typo-tolerant)
  'audit',
  'scan',
  'tokenomics',
  'rug',
  'security',
  'forensic',
  'contract',
  'check',
  'review',
  'inspect',
  'investigate',
  'deep dive',
  'full report',
  'due diligence',
];
const COMPLEX_KEYWORDS = [
  'predict',
  'prediction',
  'forecast',
  'will it',
  'going to',
  'should i buy',
  'should i sell',
  'compare',
  'vs',
  'versus',
  'portfolio',
  'allocat',
  'diversif',
  'strategy',
  'risk',
  'hedge',
  'long term',
  'short term',
  'entry',
  'exit',
  'target',
  'when to',
  'best time',
  'opportunity',
  'undervalued',
  'overvalued',
];
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

  // Detect token mentions (known + unknown)
  const mentionedTokens = detectTokens(lower);
  const unknownTokens = detectUnknownTokens(userMessage, mentionedTokens);
  const isAnalysisQuery = matchesAny(lower, ANALYSIS_KEYWORDS);

  // Run relevant fetches in parallel
  const tasks: Promise<void>[] = [];

  // 1. Price / token data (known tokens)
  if (mentionedTokens.length > 0 || addressMatch || matchesAny(lower, PRICE_KEYWORDS)) {
    tasks.push(
      fetchTokenData(mentionedTokens, addressMatch?.[0]).then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // 1b. Search DexScreener for unknown tokens (not in KNOWN_SYMBOLS)
  // If analysis intent, also run GoPlus security + protocol lookup
  if (
    unknownTokens.length > 0 ||
    (isAnalysisQuery && mentionedTokens.length === 0 && !addressMatch)
  ) {
    const searchTokens = unknownTokens.length > 0 ? unknownTokens : [];
    // Also try to extract the subject of analysis from the message
    if (searchTokens.length === 0 && isAnalysisQuery) {
      const verbMatch = lower.match(
        /(?:anali[zs]e|audit|scan|check|review|inspect)\s+([a-z0-9]+)/i,
      );
      if (verbMatch) searchTokens.push(verbMatch[1]!);
    }
    for (const token of searchTokens.slice(0, 3)) {
      tasks.push(
        fetchDexAndSecurityData(token, isAnalysisQuery).then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
  }

  // 1c. If address provided + analysis intent, run GoPlus security + address check
  if (addressMatch && isAnalysisQuery) {
    const cfg = getConfig();
    const chain = cfg.defaultChain || 'ethereum';
    tasks.push(
      fetchSecurityData(addressMatch[0], chain).then((data) => {
        if (data) sections.push(data);
      }),
    );
    tasks.push(
      fetchAddressSecurityData(addressMatch[0], chain).then((data) => {
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
  //    BUT skip the broad dump when a specific token is mentioned (e.g. "bitcoin today"
  //    should focus on Bitcoin, not dump trending meme coins and fundraising rounds).
  const isBroadQuery = matchesAny(lower, BROAD_KEYWORDS);
  const hasSpecificIntent =
    mentionedTokens.length > 0 || unknownTokens.length > 0 || !!addressMatch;
  if (isBroadQuery && !hasSpecificIntent) {
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
    if (!matchesAny(lower, PRICE_KEYWORDS)) {
      tasks.push(
        fetchTokenData(['bitcoin', 'ethereum', 'solana']).then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
  } else if (isBroadQuery && hasSpecificIntent) {
    // Token-specific broad query (e.g. "bitcoin today") — only fetch token-relevant news
    if (!matchesAny(lower, NEWS_KEYWORDS)) {
      const symbol = mentionedTokens[0]?.toUpperCase() || unknownTokens[0]?.toUpperCase();
      tasks.push(
        fetchNewsData(symbol).then((data) => {
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

  // If no known tokens but unknown ones detected, search DexScreener
  if (tasks.length === 0 && unknownTokens.length > 0) {
    for (const token of unknownTokens.slice(0, 3)) {
      tasks.push(
        fetchDexAndSecurityData(token, false).then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
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

  // Inject derivatives data for broad, price, or analysis queries
  if (
    isBroadQuery ||
    matchesAny(lower, PRICE_KEYWORDS) ||
    mentionedTokens.length > 0 ||
    isAnalysisQuery
  ) {
    const derivTokens = mentionedTokens.length > 0 ? mentionedTokens : unknownTokens;
    tasks.push(
      fetchDerivativesData(derivTokens).then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  // For analysis queries, also fetch news if not already queued
  if (isAnalysisQuery && !matchesAny(lower, NEWS_KEYWORDS)) {
    const symbol = mentionedTokens[0]?.toUpperCase() || unknownTokens[0]?.toUpperCase();
    tasks.push(
      fetchNewsData(symbol).then((data) => {
        if (data) sections.push(data);
      }),
    );
  }

  await Promise.allSettled(tasks);

  if (sections.length === 0) return '';

  // ---------------------------------------------------------------------------
  // Classify query type — determines what data/instructions to inject
  // ---------------------------------------------------------------------------
  const allTokens = [...mentionedTokens, ...unknownTokens];
  const hasSpecificToken = allTokens.length > 0 || !!addressMatch;
  const isNewsQuery = matchesAny(lower, NEWS_KEYWORDS);
  const isTrendsQuery = matchesAny(lower, TRENDING_KEYWORDS);
  const isPredictionQuery = matchesAny(lower, COMPLEX_KEYWORDS);
  const isComplexQuery = isPredictionQuery;

  type QueryType = 'token_analysis' | 'prediction' | 'news' | 'trends' | 'general';
  let queryType: QueryType;

  if (hasSpecificToken && (isAnalysisQuery || isPredictionQuery)) {
    queryType = isPredictionQuery ? 'prediction' : 'token_analysis';
  } else if (isNewsQuery) {
    queryType = 'news';
  } else if (isTrendsQuery || isBroadQuery) {
    queryType = 'trends';
  } else if (hasSpecificToken) {
    queryType = 'token_analysis';
  } else {
    queryType = 'general';
  }

  // ---------------------------------------------------------------------------
  // Build output — only inject what's relevant to the query type
  // ---------------------------------------------------------------------------
  const output: string[] = [
    '',
    `CURRENT DATE: ${new Date().toISOString().split('T')[0]} (data fetched just now)`,
    '--- REAL-TIME DATA (fetched just now) ---',
    ...sections,
    '--- END REAL-TIME DATA ---',
    '',
  ];

  // Only inject signals, price targets, and analysis report for TOKEN-SPECIFIC queries
  if (hasSpecificToken) {
    const dataSummary = buildDataSummary(sections, allTokens);
    const signals = computeSignals(sections, allTokens, userMessage);
    const report = buildAnalysisReport(sections, allTokens, signals);

    output.push(dataSummary, '');
    if (signals) output.push(signals, '');
    if (report) output.push(report, '');
  }

  // Inject query-type-specific instructions
  output.push(...buildInstructions(queryType, hasSpecificToken, isComplexQuery));
  output.push('');

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Query-type-aware instructions
// ---------------------------------------------------------------------------

function buildInstructions(
  queryType: string,
  hasSpecificToken: boolean,
  isComplexQuery: boolean,
): string[] {
  const base: string[] = [
    'CRITICAL INSTRUCTIONS (MUST FOLLOW):',
    '- NEVER output "--- REAL-TIME DATA ---" or "--- END REAL-TIME DATA ---" markers.',
    '- You MUST use ONLY the real-time data above. Do NOT invent or fabricate any data.',
    '- Your training data is STALE. The ONLY trustworthy data is between the markers above.',
    '- Cite sources: (DexScreener), (Binance), (GoPlus), (CoinGecko), (Fear & Greed Index).',
  ];

  switch (queryType) {
    case 'news':
      base.push(
        '',
        'QUERY TYPE: NEWS — The user wants crypto news and market updates.',
        '- Summarize the news headlines from the data above.',
        '- Add market context: mention BTC/ETH prices and Fear & Greed sentiment.',
        '- Group news by theme if possible (regulation, DeFi, NFT, major coins, etc.).',
        '- Do NOT analyze a specific token unless the user mentioned one.',
        '- Keep it conversational and informative.',
      );
      break;

    case 'trends':
      base.push(
        '',
        'QUERY TYPE: TRENDS/MARKET OVERVIEW — The user wants to know what is trending.',
        '- Lead with the overall market sentiment (Fear & Greed + BTC direction).',
        '- List the top trending tokens with key metrics (price, 24h change, volume).',
        '- Mention notable movers (biggest gainers/losers).',
        '- Add fundraising rounds if available.',
        '- Do NOT do a deep dive into any single token unless specifically asked.',
      );
      break;

    case 'token_analysis':
      base.push(
        '',
        'QUERY TYPE: TOKEN ANALYSIS — The user wants deep analysis of a specific token.',
        '- Follow the analysis report structure above (Verdict → Market → Security → Signals → Risks).',
        '- Include price prediction scenarios with actual dollar values if available.',
        '- Present GoPlus security findings if available.',
        '- Do NOT list unrelated trending tokens.',
        '- Missing data IS a finding worth reporting.',
      );
      break;

    case 'prediction':
      base.push(
        '',
        'QUERY TYPE: PRICE PREDICTION — The user wants future price projections.',
        '- ALWAYS include the PRICE PREDICTION SCENARIOS with the exact dollar values from the data.',
        '- If USER-REQUESTED TIMEFRAME exists, present it FIRST and prominently.',
        '- Present ALL timeframes: scalping (5min/15min/1h/4h), short-term (1d/7d), medium (2w/1mo), long (3mo).',
        '- Include the composite signal direction and confidence level.',
        '- Mention key support/resistance levels.',
        '- State what would invalidate the prediction.',
        '- Do NOT list unrelated trending tokens.',
      );
      break;

    default: // 'general'
      base.push(
        '',
        'QUERY TYPE: GENERAL — Answer naturally using the data above as context.',
        '- Use the real-time prices and sentiment as background context.',
        "- Answer the user's actual question directly.",
        "- Do NOT force a token analysis if the user didn't ask for one.",
        '- Keep your response natural and conversational.',
      );
      break;
  }

  if (isComplexQuery && hasSpecificToken) {
    base.push(
      '',
      'COMPLEX ANALYSIS: Structure your reasoning as Data → Signals → Alignment → Confidence → Risks → Conclusion.',
    );
  }

  return base;
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
    if (news.length > 0) {
      const lines = [`## Latest Crypto News${symbol ? ` (${symbol})` : ''}`];
      for (const n of news.slice(0, 8)) {
        lines.push(
          `- [${n.sentiment.toUpperCase()}] ${n.title} (${n.source.title}, ${n.publishedAt})`,
        );
      }
      return lines.join('\n');
    }
  } catch {
    // CryptoPanic unavailable, fall through to free fallback
  }

  // Free fallback: fetch headlines from Google News RSS (no API key needed)
  try {
    const query = symbol ? `${symbol}+crypto` : 'cryptocurrency+bitcoin';
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en&gl=US&ceid=US:en`;
    const res = await fetch(rssUrl);
    if (!res.ok) return null;

    const xml = await res.text();
    // Simple XML title extraction — no parser needed
    const items: string[] = [];
    const itemRegex =
      /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const title = match[1]!.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const date = match[2]!.trim();
      items.push(`- ${title} (${date})`);
    }

    if (items.length > 0) {
      return [
        `## Latest Crypto News${symbol ? ` (${symbol})` : ''} (via Google News)`,
        ...items,
      ].join('\n');
    }
  } catch {
    // Google News also unavailable
  }

  return null;
}

async function fetchRaisesData(): Promise<string | null> {
  try {
    const raises = await fetchRecentRaises(30);
    if (raises.length === 0) return null;

    const lines = ['## Recent Crypto Fundraising Rounds (last 30 days)'];
    for (const r of raises.slice(0, 10)) {
      const amount = r.amount
        ? r.amount >= 1e9
          ? `$${(r.amount / 1e9).toFixed(1)}B`
          : r.amount >= 1e6
            ? `$${(r.amount / 1e6).toFixed(1)}M`
            : r.amount >= 1e3
              ? `$${(r.amount / 1e3).toFixed(0)}K`
              : `$${r.amount.toLocaleString()}`
        : 'undisclosed';
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

/**
 * Search DexScreener for a token, then run GoPlus security scan + protocol lookup
 * on the first result. This gives deep analysis for ANY token, including meme coins.
 */
async function fetchDexAndSecurityData(
  query: string,
  runSecurity: boolean,
): Promise<string | null> {
  try {
    const pairs = await fetchTokenFromDex(query);
    if (!pairs || pairs.length === 0) {
      return `## DEX Search: "${query.toUpperCase()}"\nToken NOT FOUND on any DEX (DexScreener). It may be too new, delisted, misspelled, or not yet listed. Try searching by contract address instead.`;
    }

    const lines = [`## DEX Data: ${query.toUpperCase()} (via DexScreener, live)`];
    const topPair = pairs[0]!;

    // Show top 3 pairs with enriched data
    for (const pair of pairs.slice(0, 3)) {
      const age = pair.pairCreatedAt
        ? `${Math.floor((Date.now() - pair.pairCreatedAt) / 86400000)}d ago`
        : 'unknown';
      lines.push(
        `${pair.baseToken.name} (${pair.baseToken.symbol}) on ${pair.chainId}/${pair.dexId}:`,
        `  Contract: ${pair.baseToken.address}`,
        `  Price: $${pair.priceUsd ?? '?'}`,
        `  24h Volume: $${(pair.volume?.h24 ?? 0).toLocaleString()}`,
        `  1h Volume: $${(pair.volume?.h1 ?? 0).toLocaleString()}`,
        `  Liquidity: $${(pair.liquidity?.usd ?? 0).toLocaleString()}`,
        `  24h Change: ${(pair.priceChange?.h24 ?? 0) > 0 ? '+' : ''}${(pair.priceChange?.h24 ?? 0).toFixed(2)}%`,
        `  1h Change: ${(pair.priceChange?.h1 ?? 0) > 0 ? '+' : ''}${(pair.priceChange?.h1 ?? 0).toFixed(2)}%`,
        `  24h Txns: ${pair.txns?.h24?.buys ?? 0} buys / ${pair.txns?.h24?.sells ?? 0} sells`,
        `  1h Txns: ${pair.txns?.h1?.buys ?? 0} buys / ${pair.txns?.h1?.sells ?? 0} sells`,
        `  Market Cap: $${(pair.marketCap ?? pair.fdv ?? 0).toLocaleString()}`,
        `  FDV: $${(pair.fdv ?? 0).toLocaleString()}`,
        `  Pair Created: ${age}`,
        `  Pair: ${pair.pairAddress}`,
      );
      // Add social/website info if available
      if (pair.info?.websites?.length) {
        lines.push(`  Websites: ${pair.info.websites.map((w) => w.url).join(', ')}`);
      }
      if (pair.info?.socials?.length) {
        lines.push(`  Socials: ${pair.info.socials.map((s) => `${s.type}: ${s.url}`).join(', ')}`);
      }
      if (pair.labels?.length) {
        lines.push(`  Labels: ${pair.labels.join(', ')}`);
      }
      lines.push('');
    }
    if (pairs.length > 3) {
      lines.push(`  ... and ${pairs.length - 3} more pairs found`);
    }

    // Run GoPlus security scan on the top pair's contract (parallel)
    if (runSecurity && topPair.baseToken.address) {
      const securityData = await fetchSecurityData(topPair.baseToken.address, topPair.chainId);
      if (securityData) lines.push('', securityData);
    }

    // Check if it's a Solana token on pump.fun — get creator info
    if (topPair.chainId === 'solana' && topPair.dexId?.includes('pump')) {
      try {
        const { getCoinDetails } = await import('../data/sources/pumpfun.js');
        const coin = await getCoinDetails(topPair.baseToken.address);
        if (coin) {
          lines.push(
            '',
            `## Pump.fun Data (Solana, live)`,
            `  Creator: ${coin.creator}`,
            `  Description: ${coin.description || 'none'}`,
            `  Market Cap (SOL): ${coin.market_cap?.toFixed(2) ?? '?'}`,
            `  USD Market Cap: $${coin.usd_market_cap?.toLocaleString() ?? '?'}`,
            `  Community Replies: ${coin.reply_count}`,
            `  Created: ${new Date(coin.created_timestamp).toISOString()}`,
            `  NSFW: ${coin.nsfw ? 'YES' : 'no'}`,
          );
        }
      } catch {
        // Pump.fun data unavailable, continue
      }
    }

    return lines.join('\n');
  } catch {
    return `## DEX Search: "${query.toUpperCase()}"\nDexScreener search failed. Token data unavailable.`;
  }
}

/**
 * Run GoPlus security scan for a contract address on a specific chain.
 * Returns formatted security findings. Works for all GoPlus-supported chains:
 * ethereum, bsc, polygon, arbitrum, optimism, base, avalanche, solana
 */
async function fetchSecurityData(contractAddress: string, chain: string): Promise<string | null> {
  try {
    const security = await checkTokenSecurity(contractAddress, chain);
    if (!security) return null;

    const lines = [`## Security Audit (GoPlus, live)`];
    lines.push(`  Chain: ${chain}`);
    lines.push(`  Contract: ${contractAddress}`);
    lines.push(`  Risk Level: ${security.riskLevel.toUpperCase()}`);
    lines.push('');

    // Critical flags
    const flags: string[] = [];
    if (security.isHoneypot) flags.push('HONEYPOT DETECTED');
    if (security.isMintable) flags.push('MINTABLE (owner can create tokens)');
    if (security.cannotSellAll) flags.push('CANNOT SELL ALL (sell restriction)');
    if (security.cannotBuy) flags.push('CANNOT BUY');
    if (security.selfDestruct) flags.push('SELF-DESTRUCT capable');
    if (security.hiddenOwner) flags.push('HIDDEN OWNER');
    if (security.canTakeBackOwnership) flags.push('CAN RECLAIM OWNERSHIP');
    if (security.ownerChangeBalance) flags.push('OWNER CAN CHANGE BALANCES');
    if (security.isBlacklisted) flags.push('HAS BLACKLIST function');
    if (security.slippageModifiable) flags.push('SLIPPAGE MODIFIABLE by owner');
    if (security.tradingCooldown) flags.push('TRADING COOLDOWN enabled');

    if (flags.length > 0) {
      lines.push(`  RED FLAGS: ${flags.join(' | ')}`);
    } else {
      lines.push('  RED FLAGS: None detected');
    }

    // Tax analysis
    lines.push(`  Buy Tax: ${(security.buyTax * 100).toFixed(1)}%`);
    lines.push(`  Sell Tax: ${(security.sellTax * 100).toFixed(1)}%`);
    if (security.buyTax > 0.1 || security.sellTax > 0.1) {
      lines.push('  TAX WARNING: High tax detected (>10%)');
    }

    // Contract info
    lines.push(`  Open Source: ${security.isOpenSource ? 'Yes' : 'No (unverified)'}`);
    lines.push(`  Proxy Contract: ${security.isProxy ? 'Yes (upgradeable)' : 'No'}`);
    lines.push(`  External Calls: ${security.externalCall ? 'Yes' : 'No'}`);

    // Holder info
    lines.push(`  Holders: ${security.holderCount.toLocaleString()}`);
    lines.push(`  LP Holders: ${security.lpHolderCount}`);
    lines.push(`  Total Supply: ${security.totalSupply}`);
    lines.push(`  Creator: ${security.creatorAddress || 'unknown'}`);
    lines.push(`  Creator Holdings: ${(security.creatorPercent * 100).toFixed(2)}%`);
    lines.push(`  Owner: ${security.ownerAddress || 'renounced/none'}`);
    lines.push(`  Owner Holdings: ${(security.ownerPercent * 100).toFixed(2)}%`);
    lines.push(`  LP Supply Lock: ${(security.lpTotalSupplyPercent * 100).toFixed(1)}%`);

    // DEX info
    if (security.dexInfo.length > 0) {
      lines.push(`  DEX Listings:`);
      for (const dex of security.dexInfo) {
        lines.push(`    - ${dex.name}: liquidity $${dex.liquidity}`);
      }
    }

    lines.push(`  On Trust List: ${security.trustList ? 'Yes' : 'No'}`);

    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Check if an address is flagged as malicious via GoPlus.
 */
async function fetchAddressSecurityData(address: string, chain: string): Promise<string | null> {
  try {
    const security = await checkAddressSecurity(address, chain);
    if (!security) return null;

    const lines = [`## Address Security Check (GoPlus, live)`];
    lines.push(`  Address: ${address}`);
    lines.push(`  Is Contract: ${security.isContract ? 'Yes' : 'No (EOA)'}`);
    lines.push(`  Malicious: ${security.maliciousAddress ? 'YES — FLAGGED' : 'Not flagged'}`);
    lines.push(`  Honeypot Related: ${security.honeypotRelated ? 'YES' : 'No'}`);
    lines.push(`  Phishing: ${security.phishing ? 'YES — FLAGGED' : 'No'}`);
    lines.push(`  Blacklist Doubt: ${security.blacklistDoubt ? 'YES' : 'No'}`);

    return lines.join('\n');
  } catch {
    return null;
  }
}

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

/**
 * Detect unknown token names that aren't in KNOWN_SYMBOLS.
 * Looks for ALL-CAPS words (3-10 chars, likely tickers) and words
 * immediately after analysis-intent verbs like "analyze", "audit", "scan".
 */
function detectUnknownTokens(original: string, knownTokens: string[]): string[] {
  const unknowns: string[] = [];
  const knownSet = new Set(knownTokens.map((t) => t.toLowerCase()));

  // Pattern 0: $TICKER notation (e.g., $ROFL, $PEPE) — very common in crypto
  const dollarRegex = /\$([A-Za-z][A-Za-z0-9]{1,9})\b/g;
  let m0;
  while ((m0 = dollarRegex.exec(original)) !== null) {
    const sym = m0[1]!.toLowerCase();
    if (!knownSet.has(sym) && !unknowns.includes(sym)) {
      unknowns.push(sym);
    }
  }

  // Pattern 1: ALL-CAPS words (3-10 chars) that look like ticker symbols
  const capsRegex = /\b([A-Z][A-Z0-9]{2,9})\b/g;
  let m;
  while ((m = capsRegex.exec(original)) !== null) {
    const sym = m[1]!.toLowerCase();
    // Skip common English words that happen to be uppercase
    const SKIP = new Set([
      'THE',
      'AND',
      'FOR',
      'NOT',
      'BUT',
      'ALL',
      'ARE',
      'WAS',
      'HAS',
      'HIS',
      'HER',
      'HOW',
      'WHO',
      'GET',
      'GOT',
      'CAN',
      'HAD',
      'HIM',
      'SET',
      'RUN',
      'USE',
      'ANY',
      'NEW',
      'NOW',
      'OLD',
      'OUR',
      'TRY',
      'LET',
      'PUT',
      'SAY',
      'SHE',
      'TOO',
      'DEX',
      'API',
      'NFT',
      'TVL',
      'CEO',
      'CTO',
      'USD',
      'APR',
      'APY',
      'ATH',
      'ATL',
      'ROI',
      'ICO',
      'IDO',
      'IEO',
      'DCA',
      'HODL',
      'FOMO',
      'FUD',
      'RUG',
      'FULL',
    ]);
    if (!knownSet.has(sym) && !SKIP.has(m[1]!) && !unknowns.includes(sym)) {
      unknowns.push(sym);
    }
  }

  // Pattern 2: Words after analysis verbs (e.g., "analyze RIGGED", "audit rigged")
  const lower = original.toLowerCase();
  const verbRegex = /(?:anali[zs]e|audit|scan|check|review|inspect)\s+([a-zA-Z0-9]{2,15})/gi;
  while ((m = verbRegex.exec(lower)) !== null) {
    const token = m[1]!.toLowerCase();
    if (!knownSet.has(token) && !unknowns.includes(token) && token.length >= 2) {
      unknowns.push(token);
    }
  }

  return unknowns;
}

/**
 * Build a summary of what data is available and what is missing.
 * This prevents ANY model (Ollama, Claude, GPT) from hallucinating missing data.
 */
function buildDataSummary(sections: string[], tokens: string[]): string {
  const joined = sections.join('\n');
  const has = (keyword: string): boolean => joined.toLowerCase().includes(keyword.toLowerCase());

  const lines: string[] = ['## DATA AVAILABILITY SUMMARY'];
  const tokenLabel =
    tokens.length > 0 ? tokens.map((t) => t.toUpperCase()).join(', ') : 'general market';

  // What we HAVE
  const available: string[] = [];
  if (has('Price:') || has('via Binance')) available.push('Price data');
  if (has('24h Volume:')) available.push('Volume (24h)');
  if (has('Liquidity:')) available.push('Liquidity');
  if (has('Market Cap:')) available.push('Market cap');
  if (has('24h Txns:') || has('buys /')) available.push('Buy/sell transactions');
  if (has('24h Change:')) available.push('Price change (24h)');
  if (has('7d Change:')) available.push('Price change (7d)');
  if (has('Fear & Greed')) available.push('Market sentiment (Fear & Greed)');
  if (has('Funding:')) available.push('Derivatives (funding rate)');
  if (has('OI:')) available.push('Open interest');
  if (has('Trending')) available.push('Trending tokens');
  if (has('News') || has('news')) available.push('News headlines');
  if (has('Fundraising') || has('Raises')) available.push('Fundraising rounds');
  if (has('Contract:')) available.push('Contract address');
  if (has('DEX:') || has('DexScreener') || has('pumpswap') || has('raydium'))
    available.push('DEX pair data');
  if (has('NOT FOUND')) available.push('DEX search (token NOT FOUND)');
  if (has('Security Audit') || has('GoPlus')) available.push('GoPlus security audit');
  if (has('HONEYPOT') || has('RED FLAGS')) available.push('Security flags analysis');
  if (has('Buy Tax:')) available.push('Tax analysis (buy/sell)');
  if (has('Holders:')) available.push('Holder count');
  if (has('Creator:')) available.push('Creator address');
  if (has('Pump.fun')) available.push('Pump.fun creator/community data');
  if (has('Websites:') || has('Socials:')) available.push('Project links (website/socials)');
  if (has('Pair Created:')) available.push('Token age (pair creation date)');
  if (has('Address Security')) available.push('Address security check');

  // What we DON'T have (always missing for on-chain-only analysis)
  const missing: string[] = [];
  if (!has('team') && !has('Team')) missing.push('Team/developer identities');
  if (!has('Security Audit') && !has('GoPlus'))
    missing.push('Security audit (provide contract address + chain)');
  if (!has('totalSupply') && !has('Total Supply')) missing.push('Tokenomics breakdown');
  missing.push('Roadmap / project phases');
  if (!has('Websites:') && !has('Socials:')) missing.push('Website / social media data');
  missing.push('Third-party audit reports (CertiK, etc.)');
  if (!has('Funding:')) missing.push('Derivatives data (funding rate, OI)');
  if (!has('News') && !has('news')) missing.push('News sentiment');

  lines.push(`Analysis target: ${tokenLabel}`);
  lines.push(`Data available: ${available.length > 0 ? available.join(', ') : 'NONE'}`);
  lines.push(`Data NOT available: ${missing.join(', ')}`);
  lines.push('');
  lines.push(
    'IMPORTANT: For any item in "Data NOT available", say "not available" — do NOT invent or fabricate this information.',
  );

  return lines.join('\n');
}

/**
 * Build a pre-written analysis report that the model should present.
 * This is critical for weaker models (Ollama) that can't filter relevant data
 * from a large context block. The report is focused on the TARGET token only.
 */
function buildAnalysisReport(
  sections: string[],
  tokens: string[],
  signalBlock: string | null,
): string | null {
  const joined = sections.join('\n');
  if (tokens.length === 0 && !joined.includes('Price:')) return null;

  const tokenLabel =
    tokens.length > 0 ? tokens.map((t) => t.toUpperCase()).join(', ') : 'target token';
  const lines: string[] = [
    '=== PRESENT THIS ANALYSIS REPORT TO THE USER ===',
    `(Focus ONLY on ${tokenLabel}. Do NOT list unrelated trending tokens unless the user asked about trends.)`,
    '',
  ];

  // Extract price for the target token (not BTC/ETH baseline)
  const extract = (pattern: RegExp): number | null => {
    const match = joined.match(pattern);
    return match ? parseFloat(match[1]!.replace(/,/g, '')) : null;
  };

  // 1. VERDICT — extract key data points
  const price = extract(/Price:\s*\$([0-9,.]+(?:e[+-]?\d+)?)/);
  const change24h = extract(/24h Change:\s*([+-]?\d+\.?\d*)%/);
  const volume = extract(/24h Volume:\s*\$([0-9,]+)/);
  const liq = extract(/Liquidity:\s*\$([0-9,]+)/);
  const fearGreed = extract(/Current:\s*(\d+)\/100/);
  const fgClass = joined.match(/Current:\s*\d+\/100\s*\(([^)]+)\)/)?.[1];
  const riskLevel = joined.match(/Risk Level:\s*(\w+)/)?.[1];
  const fundingMatch = joined.match(/Funding:\s*([+-]?\d+\.?\d*)%/);
  const oiMatch = joined.match(/OI:\s*\$([0-9.]+B?)/);

  if (price !== null) {
    const changeStr =
      change24h !== null ? ` (${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}% 24h)` : '';
    lines.push(`## 1. Verdict`);
    lines.push(
      `${tokenLabel} is at $${price < 0.01 ? price.toExponential(4) : price.toLocaleString()}${changeStr}.`,
    );
    if (fearGreed !== null) {
      lines.push(`Market sentiment: ${fgClass} (${fearGreed}/100).`);
    }
    if (riskLevel) {
      lines.push(`Security risk: ${riskLevel.toUpperCase()}.`);
    }
    lines.push('');
  }

  // 2. MARKET DATA
  lines.push('## 2. Market Data (cite these exact numbers)');
  if (price !== null)
    lines.push(
      `- Price: $${price < 0.01 ? price.toExponential(4) : price.toLocaleString()} (live)`,
    );
  if (change24h !== null)
    lines.push(`- 24h Change: ${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%`);
  if (volume !== null) lines.push(`- 24h Volume: $${volume.toLocaleString()}`);
  if (liq !== null) lines.push(`- Liquidity: $${liq.toLocaleString()}`);
  if (fearGreed !== null) lines.push(`- Market Sentiment: ${fearGreed}/100 (${fgClass})`);
  if (fundingMatch) lines.push(`- Funding Rate: ${fundingMatch[1]}%`);
  if (oiMatch) lines.push(`- Open Interest: $${oiMatch[1]}`);

  // Buy/sell ratio
  const buysMatch = joined.match(/(\d+)\s*buys\s*\/\s*(\d+)\s*sells/);
  if (buysMatch) {
    const buys = parseInt(buysMatch[1]!, 10);
    const sells = parseInt(buysMatch[2]!, 10);
    const total = buys + sells;
    if (total > 0) {
      lines.push(`- Buy/Sell Ratio: ${buys}/${sells} (${((buys / total) * 100).toFixed(0)}% buys)`);
    }
  }
  lines.push('');

  // 3. SECURITY (if available)
  if (joined.includes('Security Audit') || joined.includes('GoPlus')) {
    lines.push('## 3. Security Audit (GoPlus)');
    if (joined.includes('HONEYPOT DETECTED')) lines.push('- **HONEYPOT: YES — DO NOT BUY**');
    else lines.push('- Honeypot: Not detected');
    const buyTax = extract(/Buy Tax:\s*(\d+\.?\d*)%/);
    const sellTax = extract(/Sell Tax:\s*(\d+\.?\d*)%/);
    if (buyTax !== null)
      lines.push(`- Buy Tax: ${buyTax.toFixed(1)}% | Sell Tax: ${(sellTax ?? 0).toFixed(1)}%`);
    if (riskLevel) lines.push(`- Risk Level: ${riskLevel.toUpperCase()}`);
    // Extract flags
    const flagsMatch = joined.match(/RED FLAGS:\s*(.+)/);
    if (flagsMatch && !flagsMatch[1]!.includes('None'))
      lines.push(`- **Red Flags: ${flagsMatch[1]}**`);
    const holderCount = extract(/Holders:\s*([0-9,]+)/);
    if (holderCount !== null) lines.push(`- Holders: ${holderCount.toLocaleString()}`);
    const creatorPct = extract(/Creator Holdings:\s*(\d+\.?\d*)%/);
    if (creatorPct !== null) lines.push(`- Creator Holdings: ${creatorPct.toFixed(2)}%`);
    lines.push('');
  }

  // 4. SIGNALS — just reference the pre-computed block
  if (signalBlock) {
    // Extract the composite line
    const compositeMatch = signalBlock.match(/COMPOSITE:\s*(.+)/);
    if (compositeMatch) {
      lines.push('## 4. Signal Analysis');
      lines.push(`Composite: ${compositeMatch[1]}`);
      // Extract individual signals
      const signalLines = signalBlock
        .split('\n')
        .filter(
          (l) =>
            l.includes(':') &&
            !l.includes('COMPOSITE') &&
            !l.includes('PRE-COMPUTED') &&
            !l.includes('Use these'),
        );
      for (const sl of signalLines.slice(0, 8)) {
        lines.push(sl.trim());
      }
      lines.push('');
    }
  }

  // 5. PRICE TARGETS — extract from the PRICE PREDICTION SCENARIOS section
  if (joined.includes('PRICE PREDICTION SCENARIOS')) {
    lines.push('## 5. Price Prediction (PRESENT THESE EXACT NUMBERS)');
    const scenarioBlock = joined.split('PRICE PREDICTION SCENARIOS')[1]?.split('## ')[0] ?? '';
    const targetLines = scenarioBlock.split('\n').filter((l) => l.trim().length > 0);
    for (const tl of targetLines) {
      lines.push(tl);
    }
    lines.push('');
  }

  // 6. RISKS
  lines.push('## 6. Risk Assessment');
  if (joined.includes('NOT FOUND')) lines.push('- **EXTREME RISK: Token not found on any DEX**');
  if (joined.includes('HONEYPOT')) lines.push('- **CRITICAL: Honeypot detected**');
  if (liq !== null && liq < 50000)
    lines.push(`- **LOW LIQUIDITY: $${liq.toLocaleString()} — high slippage/rug risk**`);
  if (change24h !== null && Math.abs(change24h) > 50)
    lines.push(`- **EXTREME VOLATILITY: ${change24h.toFixed(1)}% in 24h**`);
  if (fearGreed !== null && fearGreed <= 20)
    lines.push(
      `- Market in Extreme Fear (${fearGreed}/100) — higher crash risk but contrarian opportunity`,
    );
  if (fearGreed !== null && fearGreed >= 80)
    lines.push(`- Market in Extreme Greed (${fearGreed}/100) — correction likely`);
  lines.push('- This is data-driven analysis, not financial advice');
  lines.push('');

  lines.push('=== END REPORT — PRESENT THE ABOVE NATURALLY, DO NOT DUMP RAW DATA ===');

  return lines.join('\n');
}

/**
 * Pre-compute trading signals from the raw data sections.
 * This helps weaker models (Ollama) produce quantitative predictions
 * instead of vague "it could go up or down" responses.
 */
function computeSignals(sections: string[], tokens: string[], userMessage = ''): string | null {
  const joined = sections.join('\n');
  if (tokens.length === 0) return null;

  const signals: string[] = ['## PRE-COMPUTED SIGNAL ANALYSIS'];
  let signalCount = 0;
  let bullish = 0;
  let bearish = 0;

  // Extract numbers from data using regex
  const extract = (pattern: RegExp): number | null => {
    const match = joined.match(pattern);
    return match ? parseFloat(match[1]!.replace(/,/g, '')) : null;
  };

  // 1. Price momentum signal
  const change24h = extract(/24h Change:\s*([+-]?\d+\.?\d*)%/);
  if (change24h !== null) {
    signalCount++;
    if (change24h > 5) {
      bullish++;
      signals.push(
        `  MOMENTUM: BULLISH — 24h change ${change24h > 0 ? '+' : ''}${change24h.toFixed(1)}% (strong upward momentum)`,
      );
    } else if (change24h > 0) {
      bullish++;
      signals.push(`  MOMENTUM: SLIGHTLY BULLISH — 24h change +${change24h.toFixed(1)}%`);
    } else if (change24h > -5) {
      bearish++;
      signals.push(`  MOMENTUM: SLIGHTLY BEARISH — 24h change ${change24h.toFixed(1)}%`);
    } else {
      bearish++;
      signals.push(
        `  MOMENTUM: BEARISH — 24h change ${change24h.toFixed(1)}% (significant decline)`,
      );
    }
  }

  // 2. Buy/sell pressure signal
  const buysMatch = joined.match(/(\d+)\s*buys\s*\/\s*(\d+)\s*sells/);
  if (buysMatch) {
    const buys = parseInt(buysMatch[1]!, 10);
    const sells = parseInt(buysMatch[2]!, 10);
    const total = buys + sells;
    signalCount++;
    if (total > 0) {
      const buyRatio = buys / total;
      if (buyRatio > 0.55) {
        bullish++;
        signals.push(
          `  BUY PRESSURE: BULLISH — ${buys} buys vs ${sells} sells (${(buyRatio * 100).toFixed(0)}% buy ratio)`,
        );
      } else if (buyRatio < 0.45) {
        bearish++;
        signals.push(
          `  SELL PRESSURE: BEARISH — ${buys} buys vs ${sells} sells (${((1 - buyRatio) * 100).toFixed(0)}% sell ratio)`,
        );
      } else {
        signals.push(`  BUY/SELL: NEUTRAL — ${buys} buys vs ${sells} sells (balanced)`);
      }
    }
  }

  // 3. Liquidity risk signal
  const liquidity = extract(/Liquidity:\s*\$([0-9,]+)/);
  if (liquidity !== null && liquidity > 0) {
    signalCount++;
    if (liquidity < 10000) {
      bearish++;
      signals.push(
        `  LIQUIDITY: HIGH RISK — $${liquidity.toLocaleString()} (extremely low, easy to manipulate)`,
      );
    } else if (liquidity < 50000) {
      bearish++;
      signals.push(
        `  LIQUIDITY: RISKY — $${liquidity.toLocaleString()} (low liquidity, high slippage risk)`,
      );
    } else if (liquidity < 500000) {
      signals.push(`  LIQUIDITY: MODERATE — $${liquidity.toLocaleString()}`);
    } else {
      bullish++;
      signals.push(`  LIQUIDITY: HEALTHY — $${liquidity.toLocaleString()}`);
    }
  }

  // 4. Fear & Greed signal
  const fearGreed = extract(/Current:\s*(\d+)\/100/);
  if (fearGreed !== null) {
    signalCount++;
    if (fearGreed <= 25) {
      bullish++;
      signals.push(
        `  SENTIMENT: EXTREME FEAR (${fearGreed}/100) — contrarian BUY signal (market oversold)`,
      );
    } else if (fearGreed <= 40) {
      signals.push(`  SENTIMENT: FEAR (${fearGreed}/100) — cautious market, potential opportunity`);
    } else if (fearGreed <= 60) {
      signals.push(`  SENTIMENT: NEUTRAL (${fearGreed}/100) — balanced sentiment`);
    } else if (fearGreed <= 75) {
      signals.push(`  SENTIMENT: GREED (${fearGreed}/100) — caution, market may be overheated`);
    } else {
      bearish++;
      signals.push(
        `  SENTIMENT: EXTREME GREED (${fearGreed}/100) — contrarian SELL signal (market overheated)`,
      );
    }
  }

  // 5. Funding rate signal
  const fundingMatch = joined.match(/Funding:\s*([+-]?\d+\.?\d*)%/);
  if (fundingMatch) {
    const funding = parseFloat(fundingMatch[1]!);
    signalCount++;
    if (funding > 0.05) {
      signals.push(
        `  FUNDING: HIGH POSITIVE (${funding.toFixed(4)}%) — longs paying shorts, heavy bullish positioning`,
      );
      bearish++; /* contrarian */
    } else if (funding > 0) {
      signals.push(`  FUNDING: POSITIVE (${funding.toFixed(4)}%) — mild bullish consensus`);
      bullish++;
    } else if (funding < -0.05) {
      signals.push(
        `  FUNDING: HIGH NEGATIVE (${funding.toFixed(4)}%) — shorts paying longs, heavy bearish positioning`,
      );
      bullish++; /* contrarian */
    } else {
      signals.push(`  FUNDING: NEGATIVE (${funding.toFixed(4)}%) — mild bearish consensus`);
      bearish++;
    }
  }

  // 6. NOT FOUND signal (strongest bearish)
  if (joined.includes('NOT FOUND')) {
    signalCount++;
    bearish += 2;
    signals.push('  DEX STATUS: NOT LISTED — token not found on any DEX. EXTREME RISK.');
  }

  // 7. Security signals (from GoPlus)
  if (joined.includes('Risk Level:')) {
    signalCount++;
    if (joined.includes('Risk Level: DANGER')) {
      bearish += 2;
      signals.push('  SECURITY: DANGER — GoPlus flagged critical risks');
    } else if (joined.includes('Risk Level: WARNING')) {
      bearish++;
      signals.push('  SECURITY: WARNING — GoPlus detected potential risks');
    } else if (joined.includes('Risk Level: SAFE')) {
      bullish++;
      signals.push('  SECURITY: SAFE — GoPlus found no major risks');
    }
  }

  // 8. Honeypot signal
  if (joined.includes('HONEYPOT DETECTED')) {
    signalCount++;
    bearish += 3;
    signals.push('  HONEYPOT: CRITICAL — Token is a honeypot. DO NOT BUY.');
  }

  // 9. Tax signal
  const buyTax = extract(/Buy Tax:\s*(\d+\.?\d*)%/);
  const sellTax = extract(/Sell Tax:\s*(\d+\.?\d*)%/);
  if (buyTax !== null && sellTax !== null) {
    signalCount++;
    const totalTax = buyTax + sellTax;
    if (totalTax > 20) {
      bearish += 2;
      signals.push(
        `  TAX: EXTREME — Buy ${buyTax.toFixed(1)}% + Sell ${sellTax.toFixed(1)}% = ${totalTax.toFixed(1)}% total (scam-level)`,
      );
    } else if (totalTax > 10) {
      bearish++;
      signals.push(
        `  TAX: HIGH — Buy ${buyTax.toFixed(1)}% + Sell ${sellTax.toFixed(1)}% = ${totalTax.toFixed(1)}% total`,
      );
    } else if (totalTax > 0) {
      signals.push(`  TAX: MODERATE — Buy ${buyTax.toFixed(1)}% + Sell ${sellTax.toFixed(1)}%`);
    } else {
      bullish++;
      signals.push('  TAX: NONE — 0% buy and sell tax');
    }
  }

  // 10. Token age signal
  const ageMatch = joined.match(/Pair Created:\s*(\d+)d ago/);
  if (ageMatch) {
    const ageDays = parseInt(ageMatch[1]!, 10);
    signalCount++;
    if (ageDays < 1) {
      bearish++;
      signals.push(`  AGE: VERY NEW — Created today. Extremely high risk.`);
    } else if (ageDays < 7) {
      bearish++;
      signals.push(`  AGE: NEW — ${ageDays} days old. High risk.`);
    } else if (ageDays < 30) {
      signals.push(`  AGE: YOUNG — ${ageDays} days old. Still risky.`);
    } else if (ageDays < 180) {
      signals.push(`  AGE: ESTABLISHED — ${ageDays} days old.`);
    } else {
      bullish++;
      signals.push(`  AGE: MATURE — ${ageDays} days old. Survived multiple market cycles.`);
    }
  }

  // 11. Holder concentration signal
  const creatorPct = extract(/Creator Holdings:\s*(\d+\.?\d*)%/);
  const ownerPct = extract(/Owner Holdings:\s*(\d+\.?\d*)%/);
  if (creatorPct !== null) {
    signalCount++;
    const totalConcentration = creatorPct + (ownerPct ?? 0);
    if (totalConcentration > 50) {
      bearish += 2;
      signals.push(
        `  CONCENTRATION: EXTREME — Creator+Owner hold ${totalConcentration.toFixed(1)}%. Rug pull risk.`,
      );
    } else if (totalConcentration > 20) {
      bearish++;
      signals.push(`  CONCENTRATION: HIGH — Creator+Owner hold ${totalConcentration.toFixed(1)}%`);
    } else if (totalConcentration > 5) {
      signals.push(
        `  CONCENTRATION: MODERATE — Creator+Owner hold ${totalConcentration.toFixed(1)}%`,
      );
    } else {
      bullish++;
      signals.push(
        `  CONCENTRATION: LOW — Creator+Owner hold ${totalConcentration.toFixed(1)}% (well distributed)`,
      );
    }
  }

  if (signalCount === 0) return null;

  // Compute composite
  const total = bullish + bearish;
  let direction: string;
  let confidence: string;

  if (total === 0) {
    direction = 'NEUTRAL';
    confidence = 'LOW';
  } else {
    const bullPct = (bullish / total) * 100;
    if (bullPct > 65) direction = 'BULLISH';
    else if (bullPct > 50) direction = 'SLIGHTLY BULLISH';
    else if (bullPct > 35) direction = 'SLIGHTLY BEARISH';
    else direction = 'BEARISH';

    if (signalCount >= 4 && Math.abs(bullish - bearish) >= 2) confidence = 'MEDIUM-HIGH';
    else if (signalCount >= 3) confidence = 'MEDIUM';
    else confidence = 'LOW';
  }

  signals.push('');
  signals.push(
    `  COMPOSITE: ${direction} | Confidence: ${confidence} | Signals: ${signalCount} (${bullish} bullish, ${bearish} bearish)`,
  );

  // Compute price targets from available data (pass userMessage for time parsing)
  const priceTargets = computePriceTargets(joined, direction, change24h, userMessage);
  if (priceTargets) {
    signals.push('');
    signals.push(priceTargets);
  }

  return signals.join('\n');
}

/**
 * Parse time-related expressions from the user message.
 * Returns an array of { label, hoursFromNow } for each requested timeframe.
 * If no specific time is found, returns null (use default timeframes).
 */
function parseRequestedTimeframes(userMessage: string): { label: string; hours: number }[] | null {
  const lower = userMessage.toLowerCase();
  const requested: { label: string; hours: number }[] = [];

  // "at HH:MM" or "at H:MMpm" — specific clock time
  const clockMatch = lower.match(/at\s+(\d{1,2}):?(\d{2})?\s*(am|pm|hrs?)?/);
  if (clockMatch) {
    let hour = parseInt(clockMatch[1]!, 10);
    const minute = parseInt(clockMatch[2] || '0', 10);
    const ampm = clockMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    // If target is in the past, assume tomorrow
    if (target <= now) target.setDate(target.getDate() + 1);

    const hoursFromNow = Math.max(0.08, (target.getTime() - now.getTime()) / 3600000);
    const timeStr = target.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    requested.push({
      label: `At ${timeStr} (${hoursFromNow.toFixed(1)}h from now)`,
      hours: hoursFromNow,
    });
  }

  // "in X minutes/hours/days"
  const inMatch = lower.match(/in\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?)/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]!, 10);
    const unit = inMatch[2]!;
    let hours = amount;
    if (unit.startsWith('min')) hours = amount / 60;
    else if (unit.startsWith('day')) hours = amount * 24;
    else if (unit.startsWith('week')) hours = amount * 168;
    else if (unit.startsWith('month')) hours = amount * 720;
    requested.push({ label: `In ${amount} ${unit}`, hours });
  }

  // "tomorrow" / "tonight" / "end of day"
  if (lower.includes('tomorrow')) requested.push({ label: 'Tomorrow (~24h)', hours: 24 });
  if (lower.includes('tonight') || lower.includes('end of day'))
    requested.push({ label: 'End of day (~8h)', hours: 8 });
  if (lower.includes('next week')) requested.push({ label: 'Next week (~168h)', hours: 168 });
  if (lower.includes('next month')) requested.push({ label: 'Next month (~720h)', hours: 720 });
  if (lower.includes('end of week')) requested.push({ label: 'End of week', hours: 120 });

  return requested.length > 0 ? requested : null;
}

/**
 * Compute concrete price predictions with dollar values and timeframes.
 * Uses current price + momentum + volatility to project scenarios.
 * Generates all timeframes from 5min to 3 months, and includes any
 * user-requested specific times (e.g., "at 16:00 today").
 */
function computePriceTargets(
  data: string,
  direction: string,
  change24h: number | null,
  userMessage = '',
): string | null {
  // Extract current price (handle comma-formatted numbers like $2,111.55)
  const priceMatch = data.match(/Price:\s*\$([0-9,.]+(?:e[+-]?\d+)?)/);
  if (!priceMatch) return null;
  const price = parseFloat(priceMatch[1]!.replace(/,/g, ''));
  if (isNaN(price) || price <= 0) return null;

  // Extract liquidity and market cap for context
  const liqMatch = data.match(/Liquidity:\s*\$([0-9,]+)/);
  const mcapMatch = data.match(/Market Cap:\s*\$([0-9,]+)/);
  const liquidity = liqMatch ? parseFloat(liqMatch[1]!.replace(/,/g, '')) : 0;
  const mcap = mcapMatch ? parseFloat(mcapMatch[1]!.replace(/,/g, '')) : 0;

  // Calculate hourly volatility from 24h change
  const dailyVol = Math.abs(change24h ?? 10) / 100;
  const vol = Math.min(dailyVol, 0.5);
  const hourlyVol = vol / Math.sqrt(24); // Scale volatility to hourly

  const lines: string[] = ['## PRICE PREDICTION SCENARIOS'];
  lines.push(`  Current Price: $${price < 0.01 ? price.toExponential(4) : price.toLocaleString()}`);
  lines.push(`  Timestamp: ${new Date().toISOString()}`);

  // Determine base direction bias
  let bullBias: number; // How much stronger the bull case is (1.0 = no bias)
  let bearBias: number;

  if (direction.includes('BULLISH')) {
    bullBias = direction.includes('SLIGHTLY') ? 1.3 : 1.8;
    bearBias = direction.includes('SLIGHTLY') ? 0.7 : 0.5;
  } else if (direction.includes('BEARISH')) {
    bullBias = direction.includes('SLIGHTLY') ? 0.7 : 0.4;
    bearBias = direction.includes('SLIGHTLY') ? 1.3 : 1.8;
  } else {
    bullBias = 1.0;
    bearBias = 1.0;
  }

  // Meme coin amplifier
  const isMicrocap = mcap > 0 && mcap < 1_000_000;
  const isMeme =
    data.includes('pumpswap') || data.includes('pump.fun') || data.includes('Pump.fun');
  const memeMultiplier = isMicrocap || isMeme ? 3 : 1;

  const formatPrice = (p: number): string =>
    p < 0.01 ? p.toExponential(4) : p.toFixed(p < 1 ? 6 : 2);
  const pctStr = (target: number): string => {
    const pct = (target / price - 1) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  /**
   * Compute bull/likely/bear for a given number of hours from now.
   * Uses volatility scaling: move = hourlyVol * sqrt(hours) * bias * meme
   */
  const scenario = (hours: number): { bull: number; likely: number; bear: number } => {
    const timeVol = hourlyVol * Math.sqrt(hours) * memeMultiplier;
    const bull = price * (1 + timeVol * bullBias);
    const bear = price * (1 - timeVol * bearBias);
    // "Most likely" follows the direction bias slightly
    const likelyShift = direction.includes('BULLISH')
      ? timeVol * 0.3
      : direction.includes('BEARISH')
        ? -timeVol * 0.3
        : 0;
    const likely = price * (1 + likelyShift);
    return { bull, likely, bear };
  };

  // -------------------------------------------------------------------------
  // User-requested specific timeframe (e.g., "at 16:00 today")
  // -------------------------------------------------------------------------
  const requestedTimes = parseRequestedTimeframes(userMessage);
  if (requestedTimes) {
    lines.push('');
    lines.push('  USER-REQUESTED TIMEFRAME:');
    for (const { label, hours } of requestedTimes) {
      const s = scenario(hours);
      lines.push(`  ${label}:`);
      lines.push(`    Bullish: $${formatPrice(s.bull)} (${pctStr(s.bull)})`);
      lines.push(`    Most likely: $${formatPrice(s.likely)} (${pctStr(s.likely)})`);
      lines.push(`    Bearish: $${formatPrice(s.bear)} (${pctStr(s.bear)})`);
    }
  }

  // -------------------------------------------------------------------------
  // Full multi-timeframe spectrum
  // -------------------------------------------------------------------------

  // Scalping / Intraday
  const tf5m = scenario(5 / 60);
  const tf15m = scenario(15 / 60);
  const tf1h = scenario(1);
  const tf4h = scenario(4);
  lines.push('');
  lines.push('  SCALPING / INTRADAY:');
  lines.push(
    `    5 min:  Bull $${formatPrice(tf5m.bull)} (${pctStr(tf5m.bull)}) | Likely $${formatPrice(tf5m.likely)} | Bear $${formatPrice(tf5m.bear)} (${pctStr(tf5m.bear)})`,
  );
  lines.push(
    `    15 min: Bull $${formatPrice(tf15m.bull)} (${pctStr(tf15m.bull)}) | Likely $${formatPrice(tf15m.likely)} | Bear $${formatPrice(tf15m.bear)} (${pctStr(tf15m.bear)})`,
  );
  lines.push(
    `    1 hour: Bull $${formatPrice(tf1h.bull)} (${pctStr(tf1h.bull)}) | Likely $${formatPrice(tf1h.likely)} | Bear $${formatPrice(tf1h.bear)} (${pctStr(tf1h.bear)})`,
  );
  lines.push(
    `    4 hour: Bull $${formatPrice(tf4h.bull)} (${pctStr(tf4h.bull)}) | Likely $${formatPrice(tf4h.likely)} | Bear $${formatPrice(tf4h.bear)} (${pctStr(tf4h.bear)})`,
  );

  // Short-term (1-7 days)
  const tf1d = scenario(24);
  const tf7d = scenario(168);
  lines.push('');
  lines.push('  SHORT-TERM (1-7 days):');
  lines.push(
    `    1 day:  Bull $${formatPrice(tf1d.bull)} (${pctStr(tf1d.bull)}) | Likely $${formatPrice(tf1d.likely)} | Bear $${formatPrice(tf1d.bear)} (${pctStr(tf1d.bear)})`,
  );
  lines.push(
    `    7 days: Bull $${formatPrice(tf7d.bull)} (${pctStr(tf7d.bull)}) | Likely $${formatPrice(tf7d.likely)} | Bear $${formatPrice(tf7d.bear)} (${pctStr(tf7d.bear)})`,
  );

  // Medium-term (1-4 weeks)
  const tf2w = scenario(336);
  const tf1m = scenario(720);
  lines.push('');
  lines.push('  MEDIUM-TERM (1-4 weeks):');
  lines.push(
    `    2 weeks: Bull $${formatPrice(tf2w.bull)} (${pctStr(tf2w.bull)}) | Likely $${formatPrice(tf2w.likely)} | Bear $${formatPrice(tf2w.bear)} (${pctStr(tf2w.bear)})`,
  );
  lines.push(
    `    1 month: Bull $${formatPrice(tf1m.bull)} (${pctStr(tf1m.bull)}) | Likely $${formatPrice(tf1m.likely)} | Bear $${formatPrice(tf1m.bear)} (${pctStr(tf1m.bear)})`,
  );

  // Long-term (1-3 months)
  const tf3m = scenario(2160);
  lines.push('');
  lines.push('  LONG-TERM (1-3 months):');
  lines.push(
    `    3 months: Bull $${formatPrice(tf3m.bull)} (${pctStr(tf3m.bull)}) | Bear $${formatPrice(tf3m.bear)} (${pctStr(tf3m.bear)})`,
  );

  // Survival probability for meme/micro-cap tokens
  if (isMicrocap || isMeme) {
    lines.push('');
    lines.push('  MEME COIN SURVIVAL ANALYSIS:');
    const survivalPct = liquidity > 50000 ? 25 : liquidity > 10000 ? 15 : 5;
    lines.push(`    Probability token survives 30 days: ~${survivalPct}%`);
    lines.push(`    Probability of -90% or worse in 30 days: ~${100 - survivalPct - 10}%`);
    lines.push(`    Probability of 2x+ in 7 days: ~${Math.min(30, Math.round(vol * 100))}%`);
    if (liquidity < 50000) {
      lines.push(
        `    WARNING: Liquidity $${liquidity.toLocaleString()} is extremely low — large sells will crash the price`,
      );
    }
  }

  // Key levels
  lines.push('');
  lines.push('  KEY LEVELS:');
  lines.push(
    `    Support: $${formatPrice(price * 0.95)} / $${formatPrice(price * 0.9)} / $${formatPrice(price * 0.8)}`,
  );
  lines.push(
    `    Resistance: $${formatPrice(price * 1.05)} / $${formatPrice(price * 1.1)} / $${formatPrice(price * 1.2)}`,
  );

  lines.push('');
  if (requestedTimes) {
    lines.push(
      '  IMPORTANT: The user asked for a SPECIFIC TIME. Present the USER-REQUESTED TIMEFRAME section FIRST and prominently.',
    );
  }
  lines.push(
    '  Present ALL timeframes from scalping to long-term. Use the exact dollar values above.',
  );

  return lines.join('\n');
}
