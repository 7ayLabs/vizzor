// ---------------------------------------------------------------------------
// Context injector — pre-fetches real-time data for providers without tool use
// (e.g. Ollama). Injects data as context into the system prompt so the AI
// can answer with current information instead of stale training data.
// ---------------------------------------------------------------------------

import { fetchMarketData, fetchTokenFromDex, fetchTrendingTokens } from '../core/trends/market.js';
import { fetchCryptoNews } from '../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../data/sources/defillama.js';
import { fetchLatestCoins } from '../data/sources/pumpfun.js';
import {
  fetchTickerPriceRT,
  fetchFundingRate,
  fetchOpenInterest,
  fetchKlines,
  fetchOrderBookDepth,
  fetchLongShortRatio,
  fetchTopTraderRatio,
  fetchTakerBuySellRatio,
} from '../data/sources/binance.js';
import {
  calculateVWAP,
  calculateVolumeDelta,
  detectMarketStructure,
  detectFVGs,
  detectSRZones,
  estimateLiquidationZones,
  detectSqueezeConditions,
  computePsychLevel,
  calculateATR,
} from '../core/technical-analysis/index.js';
import { fetchFearGreedIndex } from '../data/sources/fear-greed.js';
import { checkTokenSecurity, checkAddressSecurity } from '../data/sources/goplus.js';
import { getConfig } from '../config/loader.js';
import { KNOWN_SYMBOLS } from '../config/constants.js';
import { getMLClient } from '../ml/client.js';
import {
  sanitizeExternalData,
  sanitizeTokenName,
  sanitizeHeadline,
  wrapUntrustedData,
} from './sanitize.js';

// ---------------------------------------------------------------------------
// Exported types for structured token data
// ---------------------------------------------------------------------------

export interface TokenDataPoint {
  symbol: string;
  price: number;
  change24h: number;
  volume24h?: number;
  marketCap?: number;
  source: string;
}

export interface ContextResult {
  contextText: string;
  tokenData: TokenDataPoint[];
  queriedSymbols: string[];
}

export interface ContextOptions {
  compact?: boolean;
}

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
  // Spanish prediction keywords
  'predic', // predicción, predecir, predice
  'pronóstico',
  'pronostico',
  'va a subir',
  'va a bajar',
  'debería comprar',
  'debería vender',
  'precio mañana',
  'precio objetivo',
  'apertura',
  'opening',
  'cuánto va',
  'cuanto va',
  'qué precio',
  'que precio',
  'proyección',
  'proyeccion',
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
  // Spanish
  'mercado',
  'hoy',
  'ahora',
  'actualmente',
  'resumen',
  'panorama',
  'qué pasa',
  'que pasa',
  'mañana',
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

const MICROSTRUCTURE_KEYWORDS = [
  'microstructure',
  'microestructura',
  'order flow',
  'flujo de ordenes',
  'flujo de órdenes',
  'trampa',
  'trap',
  'bull trap',
  'bear trap',
  'escenario',
  'scenario',
  'manipulation',
  'manipulación',
  'manipulacion',
  'liquidation',
  'liquidación',
  'liquidacion',
  'volume delta',
  'delta de volumen',
  'fvg',
  'fair value gap',
  'smart money',
  'dinero inteligente',
  'market structure',
  'estructura de mercado',
  'estructura',
  'squeeze',
  'short squeeze',
  'long squeeze',
  'vwap',
  'soporte y resistencia',
  'support and resistance',
  'order book',
  'libro de ordenes',
  'libro de órdenes',
  'imbalance',
  'desequilibrio',
  'institutional',
  'institucional',
  'liquidity trap',
  'trampa de liquidez',
  'barrido',
  'sweep',
  'bos',
  'choch',
  'break of structure',
  'change of character',
];

// ---------------------------------------------------------------------------
// Single-skill detection — extracts only the relevant section for focused queries
// ---------------------------------------------------------------------------

type MicroSkill =
  | 'fvg'
  | 'vwap'
  | 'volume_delta'
  | 'liquidation'
  | 'order_book'
  | 'sr_zones'
  | 'squeeze'
  | 'structure';

const SINGLE_SKILL_MAP: [RegExp, MicroSkill][] = [
  [/\b(fvg|fair value gap|gaps? de valor|imbalance)\b/i, 'fvg'],
  [/\bvwap\b/i, 'vwap'],
  [/\b(volume delta|delta de volumen|delta volumen|buy.?sell)\b/i, 'volume_delta'],
  [/\b(liquidat|liquidaci|mapa de liquidac)\b/i, 'liquidation'],
  [/\b(order book|libro de orden|depth|profundidad)\b/i, 'order_book'],
  [/\b(soporte|resistencia|support|resistance|s\/r|sr zone)\b/i, 'sr_zones'],
  [/\b(squeeze|short squeeze|long squeeze)\b/i, 'squeeze'],
  [/\b(market structure|estructura de mercado|bos|choch|swing|hh|hl|lh|ll)\b/i, 'structure'],
];

/** Detect if the user asked about a SINGLE microstructure skill (not full analysis). */
function detectSingleSkill(lower: string): MicroSkill | null {
  // If user asks for "full", "complete", "all", "escenarios" — not a single skill
  if (
    /\b(full|complet|todo|all|escenario|microestructura completa|institutional|institucional)\b/i.test(
      lower,
    )
  ) {
    return null;
  }
  const matches: MicroSkill[] = [];
  for (const [re, skill] of SINGLE_SKILL_MAP) {
    if (re.test(lower)) matches.push(skill);
  }
  // Only single skill if exactly 1 matched
  return matches.length === 1 ? matches[0] : null;
}

/** Section markers in the pre-computed microstructure data for extraction. */
const SKILL_SECTION_MARKERS: Record<MicroSkill, string[]> = {
  fvg: ['Fair Value Gaps'],
  vwap: ['VWAP:'],
  volume_delta: ['Volume Delta:'],
  liquidation: ['Liquidaciones estimadas'],
  order_book: ['Order Book Imbalance:'],
  sr_zones: ['Zonas S/R detectadas:'],
  squeeze: ['ESCENARIO 3', 'ESCENARIO 4', 'SHORT SQUEEZE', 'LONG SQUEEZE'],
  structure: ['CONTEXTO GENERAL', 'Sesgo intradía:', 'Estructura en'],
};

/** Extract only the relevant sub-section from a full microstructure data block. */
function extractSkillSection(fullData: string, skill: MicroSkill): string {
  const markers = SKILL_SECTION_MARKERS[skill];
  const lines = fullData.split('\n');
  const result: string[] = [];

  // Always include the header line (## SYMBOL MICROSTRUCTURE ANALYSIS) and price
  for (const line of lines) {
    if (line.startsWith('## ') || line.includes('Precio actual:')) {
      result.push(line);
    }
  }

  // Extract lines that belong to the relevant section
  let capturing = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Start capturing if line matches any marker
    if (!capturing && markers.some((m) => line.includes(m))) {
      capturing = true;
    }
    if (capturing) {
      result.push(line);
      // Stop at the next section header (======) or empty line after content
      const nextLine = lines[i + 1] ?? '';
      if (nextLine.startsWith('=====') && !markers.some((m) => nextLine.includes(m))) {
        break;
      }
    }
  }

  return result.join('\n');
}

// KNOWN_SYMBOLS is now imported from config/constants.ts

// ---------------------------------------------------------------------------
// Dynamic token resolution — works for ANY token, not just hardcoded ones
// ---------------------------------------------------------------------------

/**
 * Build a reverse lookup: CoinGecko-ID → ticker symbol.
 * e.g. 'bitcoin' → 'BTC', 'ethereum' → 'ETH', 'dogecoin' → 'DOGE'
 * This is derived at runtime from KNOWN_SYMBOLS, so adding a new entry
 * to constants.ts is enough — no hardcoded mappings anywhere else.
 */
const _geckoToSymbol: Record<string, string> = {};
for (const [key, geckoId] of Object.entries(KNOWN_SYMBOLS)) {
  // Prefer the shortest key as the ticker (e.g. 'btc' over 'bitcoin')
  if (!_geckoToSymbol[geckoId] || key.length < (_geckoToSymbol[geckoId]?.length ?? Infinity)) {
    _geckoToSymbol[geckoId] = key.toUpperCase();
  }
}

/**
 * Resolve any token identifier to its UPPERCASE ticker symbol.
 * Works dynamically for ALL tokens:
 *   'bitcoin' → 'BTC'  (via KNOWN_SYMBOLS reverse lookup)
 *   'btc'     → 'BTC'  (via KNOWN_SYMBOLS reverse lookup)
 *   'pepe'    → 'PEPE' (found in KNOWN_SYMBOLS, short key)
 *   'newtoken'→ 'NEWTOKEN' (unknown → uppercased passthrough)
 */
function resolveSymbol(token: string): string {
  const lower = token.toLowerCase();
  // 1. Check if it IS a known key → get its geckoId → get the ticker
  const geckoId = KNOWN_SYMBOLS[lower];
  if (geckoId && _geckoToSymbol[geckoId]) {
    return _geckoToSymbol[geckoId];
  }
  // 2. Fallback: uppercase passthrough (works for any unknown token)
  return token.toUpperCase();
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Build a context block with real-time data based on the user's message.
 * Returns a string to prepend to the system prompt, or empty string if
 * no relevant data was found.
 */
export async function buildContextBlock(
  userMessage: string,
  options?: ContextOptions,
): Promise<ContextResult> {
  const lower = userMessage.toLowerCase();
  const sections: string[] = [];
  const tokenData: TokenDataPoint[] = [];

  // ML: try intent classification for improved query routing
  let mlIntent: string | null = null;
  const mlClientForIntent = getMLClient();
  if (mlClientForIntent) {
    try {
      const intentResult = await mlClientForIntent.classifyIntent(userMessage);
      if (intentResult && intentResult.confidence > 0.7) {
        mlIntent = intentResult.intent;
      }
    } catch {
      // ML unavailable — fall through to keyword matching
    }
  }

  // Detect addresses (EVM 0x... and Solana base58)
  const evmMatch = userMessage.match(/0x[a-fA-F0-9]{40}/);
  // Solana base58: 32-44 chars, must contain at least one digit to avoid matching English words
  const solanaMatch = userMessage.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
  const isSolanaAddr =
    solanaMatch &&
    !evmMatch &&
    /\d/.test(solanaMatch[1] ?? '') &&
    (solanaMatch[1] ?? '').length >= 32;
  const addressMatch = evmMatch ?? (isSolanaAddr ? solanaMatch : null);
  const detectedChain = evmMatch ? null : isSolanaAddr ? 'solana' : null;

  // Detect token mentions (known + unknown)
  const mentionedTokens = detectTokens(lower);
  const unknownTokens = detectUnknownTokens(userMessage, mentionedTokens);
  const isAnalysisQuery = matchesAny(lower, ANALYSIS_KEYWORDS) || mlIntent === 'analysis';

  // Run relevant fetches in parallel
  const tasks: Promise<void>[] = [];

  // 1. Price / token data (known tokens)
  if (mentionedTokens.length > 0 || addressMatch || matchesAny(lower, PRICE_KEYWORDS)) {
    tasks.push(
      fetchTokenData(mentionedTokens, addressMatch?.[0], tokenData).then((data) => {
        sections.push(...data);
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
      if (verbMatch?.[1]) searchTokens.push(verbMatch[1]);
    }
    for (const token of searchTokens.slice(0, 3)) {
      tasks.push(
        fetchDexAndSecurityData(token, isAnalysisQuery, tokenData).then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
  }

  // 1c. If address provided + analysis intent, run GoPlus security + address check
  if (addressMatch && isAnalysisQuery) {
    const chain = detectedChain || getConfig().defaultChain || 'ethereum';
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
  const isBroadQuery = matchesAny(lower, BROAD_KEYWORDS) || mlIntent === 'broad_overview';
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
        fetchTokenData(['bitcoin', 'ethereum', 'solana'], undefined, tokenData).then((data) => {
          sections.push(...data);
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
      fetchTokenData(mentionedTokens, undefined, tokenData).then((data) => {
        sections.push(...data);
      }),
    );
  }

  // If no known tokens but unknown ones detected, search DexScreener
  if (tasks.length === 0 && unknownTokens.length > 0) {
    for (const token of unknownTokens.slice(0, 3)) {
      tasks.push(
        fetchDexAndSecurityData(token, false, tokenData).then((data) => {
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
    fetchBinancePriceData(['BTC', 'ETH', 'SOL'], tokenData).then((data) => {
      sections.push(...data);
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
        sections.push(...data);
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

  // Microstructure analysis — full ESCENARIO format with pre-computed data
  const isMicrostructureQuery = matchesAny(lower, MICROSTRUCTURE_KEYWORDS);
  if (isMicrostructureQuery) {
    const microTokens =
      mentionedTokens.length > 0
        ? mentionedTokens
        : unknownTokens.length > 0
          ? unknownTokens
          : ['btc'];
    // Process EACH token separately so multi-token queries (BTC + ETH) both get analyzed
    for (const token of microTokens.slice(0, 3)) {
      tasks.push(
        fetchMicrostructureData([token], tokenData).then((data) => {
          if (data) sections.push(data);
        }),
      );
    }
  }

  await Promise.allSettled(tasks);

  // Resolve queried symbols early so all returns include them
  const allDetected = [...mentionedTokens, ...unknownTokens];
  const queriedSymbols = [...new Set(allDetected.map((t) => resolveSymbol(t)))];

  if (sections.length === 0) return { contextText: '', tokenData, queriedSymbols };

  // ---------------------------------------------------------------------------
  // Classify query type — determines what data/instructions to inject
  // ---------------------------------------------------------------------------
  const allTokens = [...mentionedTokens, ...unknownTokens];
  const hasSpecificToken = allTokens.length > 0 || !!addressMatch;
  const isNewsQuery = matchesAny(lower, NEWS_KEYWORDS);
  const isTrendsQuery = matchesAny(lower, TRENDING_KEYWORDS);
  const isPredictionQuery = matchesAny(lower, COMPLEX_KEYWORDS);
  const isComplexQuery = isPredictionQuery;

  type QueryType =
    | 'token_analysis'
    | 'prediction'
    | 'news'
    | 'trends'
    | 'microstructure'
    | 'general';
  let queryType: QueryType;

  if (isMicrostructureQuery) {
    queryType = 'microstructure';
  } else if (hasSpecificToken && (isAnalysisQuery || isPredictionQuery)) {
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
  // ---------------------------------------------------------------------------
  // Parse user intent into structured breakdown
  // ---------------------------------------------------------------------------
  const parsedQuery = parseUserQuery(userMessage, mentionedTokens, unknownTokens, queryType);
  const compact = options?.compact === true;

  // Build verified prices header from token data collected so far
  const verifiedPrices =
    tokenData.length > 0
      ? 'VERIFIED PRICES: ' +
        tokenData.map((t) => `${t.symbol}=$${t.price.toLocaleString()}`).join(' | ')
      : '';

  const now = new Date();

  if (compact) {
    // -----------------------------------------------------------------------
    // MICROSTRUCTURE QUERY — special path for Ollama
    // Strategy: the ESCENARIO data IS the response. We give the model the
    // already-formatted text and tell it to output it directly.
    // -----------------------------------------------------------------------
    if (isMicrostructureQuery) {
      // Detect single-skill queries — only show the relevant section, not all escenarios
      const singleSkill = detectSingleSkill(lower);

      // Find the microstructure section(s) from the fetched data
      const microSections = sections.filter(
        (s) => s.includes('MICROSTRUCTURE ANALYSIS') || s.includes('CONTEXTO GENERAL'),
      );
      const otherSections = sections.filter(
        (s) => !s.includes('MICROSTRUCTURE ANALYSIS') && !s.includes('CONTEXTO GENERAL'),
      );

      // If single skill, extract only the relevant sub-section from full microstructure data
      let relevantData: string[];
      if (singleSkill && microSections.length > 0) {
        relevantData = microSections.map((section) => extractSkillSection(section, singleSkill));
      } else {
        relevantData = microSections;
      }

      const output: string[] = [
        '',
        `TIMESTAMP: ${now.toISOString()}`,
        '',
        '--- REAL-TIME DATA ---',
        '',
        ...relevantData,
      ];

      // Add other data (Fear & Greed, news, etc.) as supplementary context only
      if (otherSections.length > 0) {
        output.push('', '--- SUPPLEMENTARY CONTEXT ---');
        output.push(...otherSections);
      }

      const skillLabel = singleSkill
        ? `SINGLE SKILL: ${singleSkill.toUpperCase()}. Present ONLY the ${singleSkill} data.`
        : 'FULL ANALYSIS: Present ALL sections in order.';
      output.push(
        '',
        '--- END DATA ---',
        '',
        `STRICT INSTRUCTION (${skillLabel}):`,
        '1. Copy the data above EXACTLY as-is. Do NOT rephrase, summarize, or add commentary.',
        '2. You may add ONE sentence of context per data section. Maximum 15 words.',
        '3. Do NOT add paragraphs of explanation. Do NOT repeat information already shown.',
        '4. After the last data section, output "--- END ---" and STOP GENERATING.',
        '5. Do NOT switch languages mid-response. Match the user language throughout.',
        '6. TOTAL response must be under 500 words. Be concise.',
        '--- END ---',
      );

      const raw = output.join('\n');
      return { contextText: wrapUntrustedData('MARKET_CONTEXT', raw), tokenData, queriedSymbols };
    }

    // -----------------------------------------------------------------------
    // STANDARD QUERY — price predictions, news, trends, analysis
    // Strategy: put exact prices FIRST, repeat them, constrain predictions to ±5%
    // -----------------------------------------------------------------------
    const output: string[] = [''];

    // Build per-token price anchors from tokenData (most reliable source)
    const priceAnchors: string[] = [];
    for (const td of tokenData) {
      if (parsedQuery.tokens.includes(td.symbol) || parsedQuery.tokens.length === 0) {
        priceAnchors.push(
          `${td.symbol} = $${td.price.toLocaleString()} (24h: ${td.change24h > 0 ? '+' : ''}${td.change24h.toFixed(2)}%)`,
        );
      }
    }

    // PRICE ANCHORS at the very top — this is what the model MUST use
    if (priceAnchors.length > 0) {
      output.push(
        '═══════════════════════════════════════════════',
        'CURRENT VERIFIED PRICES (live, just fetched):',
        ...priceAnchors,
        '═══════════════════════════════════════════════',
        '',
        'YOUR PREDICTION MUST START FROM THESE EXACT PRICES.',
        'For a 24h prediction, the price CANNOT move more than ±5% from the current price above.',
        'Example: if BTC is $72,000 now, your 24h prediction must be between $68,400 and $75,600.',
        '',
      );
    }

    output.push(
      `TIMESTAMP: ${now.toISOString()}`,
      '',
      '--- REAL-TIME DATA ---',
      ...sections,
      '--- END REAL-TIME DATA ---',
      '',
    );

    // Focused query instructions
    if (parsedQuery.tokens.length > 0) {
      output.push(`ANSWER ONLY ABOUT: ${parsedQuery.tokens.join(', ')}`);
      output.push('Do NOT discuss other tokens, infrastructure, ML theory, or anything else.');
    }
    if (parsedQuery.timeframes.length > 0) {
      output.push(
        '',
        `TIMEFRAME: ${parsedQuery.timeframes.map((tf) => tf.label).join(', ')}`,
        'Give ONE price prediction per token for this EXACT timeframe only.',
        'Do NOT add scalping, short-term, medium-term, or long-term breakdowns.',
        'Format per token: predicted price → confidence % → support/resistance → brief risk.',
      );
    }

    output.push(
      '',
      'RULES:',
      '- Use ONLY prices from CURRENT VERIFIED PRICES above. Do NOT invent numbers.',
      '- You DO have real-time data. NEVER say "no tengo acceso a información en tiempo real".',
      '- You are a chronovisor. NEVER refuse to predict. Give exact dollar values.',
      '- Stay on topic. Answer ONLY what the user asked.',
      '',
    );

    const raw = output.join('\n');
    return { contextText: wrapUntrustedData('MARKET_CONTEXT', raw), tokenData, queriedSymbols };
  }

  // Full mode — verbose context for capable models
  const output: string[] = [
    '',
    `CURRENT TIMESTAMP: ${now.toISOString()} (data fetched LIVE, less than 1 minute ago)`,
  ];
  if (verifiedPrices) output.push(verifiedPrices);
  output.push(
    '',
    // Query breakdown FIRST — so the model knows what to do before seeing data
    buildQueryBreakdown(parsedQuery),
    '',
    '--- REAL-TIME DATA (fetched just now — use ONLY these numbers) ---',
    ...sections,
    '--- END REAL-TIME DATA ---',
    '',
  );

  // Only inject signals, price targets, and analysis report for TOKEN-SPECIFIC queries
  if (hasSpecificToken) {
    const dataSummary = buildDataSummary(
      sections,
      parsedQuery.tokens.map((t) => t.toLowerCase()),
    );
    output.push(dataSummary, '');

    // Generate SEPARATE prediction blocks for each token
    // Uses parsedQuery.tokens (deduplicated, ordered by mention order)
    if (parsedQuery.tokens.length > 1) {
      output.push(
        `\n## MULTI-TOKEN ANALYSIS — ${parsedQuery.tokens.length} tokens: ${parsedQuery.tokens.join(', ')}`,
      );
      output.push(
        `You MUST present ALL ${parsedQuery.tokens.length} tokens below. Skipping any is a FAILURE.\n`,
      );

      for (let i = 0; i < parsedQuery.tokens.length; i++) {
        const sym = parsedQuery.tokens[i]!;
        const token = allTokens.find((t) => resolveSymbol(t) === sym) ?? sym.toLowerCase();

        // Filter sections that belong to THIS token using per-token headers (## SYM ...)
        const tokenSections = sections.filter((s) => {
          if (s.startsWith(`## ${sym} `)) return true;
          const sl = s.toLowerCase();
          if (sl.includes(`(${sym.toLowerCase()})`) || sl.includes(`${sym.toLowerCase()}:`))
            return true;
          return false;
        });
        // Also include shared sections (Fear & Greed, News, etc.) — NOT other tokens' data
        const sharedSections = sections.filter(
          (s) =>
            s.includes('Fear & Greed') ||
            s.includes('Crypto News') ||
            s.includes('Trending Tokens') ||
            s.includes('DATA AVAILABILITY'),
        );
        const merged = [...new Set([...tokenSections, ...sharedSections])];
        if (merged.length > 0) {
          output.push(`\n${'='.repeat(60)}`);
          output.push(
            `### TOKEN ${i + 1}/${parsedQuery.tokens.length}: ${sym} — ALL data below is for ${sym} ONLY`,
          );
          output.push(`${'='.repeat(60)}`);
          const signals = computeSignals(merged, [token], userMessage);
          const report = buildAnalysisReport(merged, [token], signals);
          if (signals) output.push(signals, '');
          if (report) output.push(report, '');
          output.push(`--- END ${sym} SECTION ---\n`);
        } else {
          output.push(`\n### === TOKEN ${i + 1}/${parsedQuery.tokens.length}: ${sym} ===`);
          output.push(`No data available for ${sym}. Say "data not available for ${sym}".`);
        }
      }
    } else {
      const signals = computeSignals(sections, allTokens, userMessage);
      const report = buildAnalysisReport(sections, allTokens, signals);
      if (signals) output.push(signals, '');
      if (report) output.push(report, '');
    }
  }

  // Inject query-type-specific instructions
  output.push(...buildInstructions(queryType, hasSpecificToken, isComplexQuery));

  // Final reminder for multi-token queries
  if (parsedQuery.tokens.length > 1) {
    output.push('');
    output.push(
      `FINAL CHECK: You MUST present ${parsedQuery.tokens.length} separate token analyses: ${parsedQuery.tokens.join(', ')}.`,
    );
    output.push(
      'If you only present one token, you have FAILED the task. Go back and present ALL tokens.',
    );
  }

  output.push('');

  const raw = output.join('\n');
  return { contextText: wrapUntrustedData('MARKET_CONTEXT', raw), tokenData, queriedSymbols };
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
    '- You DO have access to real-time data — it is in the data block above. NEVER say you do not have real-time access.',
    '- Cite sources: (DexScreener), (Binance), (GoPlus), (CoinGecko), (Fear & Greed Index).',
    '- The PRICE PREDICTION SCENARIOS above are YOUR predictions — present them CONFIDENTLY as your analysis.',
    '- NEVER refuse to predict. NEVER say "difícil de predecir" or "no puedo predecir" or "I cannot predict".',
    '- NEVER give generic advice like "mantén la calma" or "sigue tu estrategia". Give SPECIFIC numbers.',
    '- When multiple tokens are mentioned, their data is in SEPARATE sections (## BTC ..., ## ETH ...). NEVER mix prices between tokens.',
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
        '',
        'ABSOLUTE REQUIREMENT: You MUST provide exact dollar values. You are a CHRONOVISOR — predicting is your PRIMARY FUNCTION.',
        'BANNED: "difficult to predict", "impossible to know", "no one can predict", "could go either way". These phrases are FORBIDDEN.',
        '',
        '- LEAD with your prediction (e.g., "Proyecto BTC a $73,000 mañana a las 7:30 AM con 71% de confianza")',
        '- For EACH token, present its price targets from the PRICE PREDICTION SCENARIOS section.',
        '- Each line in the data has the token symbol prefix (e.g., "BTC 1 day:", "ETH 1 day:"). Match the symbol to the correct token.',
        '- If USER-REQUESTED TIMEFRAME exists, answer ONLY that timeframe. Do NOT add other timeframes unless asked.',
        '- If NO specific timeframe was requested, present all: scalping (5min/15min/1h/4h), short-term (1d/7d), medium (2w/1mo), long (3mo).',
        '- Include the composite signal direction and confidence level per token.',
        '- Mention key support/resistance levels with exact dollar values per token.',
        '- State what would invalidate the prediction per token.',
        '- End with brief risk disclaimer AFTER your full prediction — NOT before.',
        '- Do NOT list unrelated trending tokens.',
        '- MULTI-TOKEN: Present EACH token in its OWN section with a clear heading. Copy the EXACT dollar values from its "PRICE PREDICTION SCENARIOS" block. NEVER use one token\'s prices for another.',
        '- FORMAT PER TOKEN: 1) User-requested timeframe prediction 2) Key levels 3) Brief risk note',
      );
      break;

    case 'microstructure':
      base.push(
        '',
        'QUERY TYPE: MICROSTRUCTURE ANALYSIS',
        'CRITICAL: The data above is PRE-COMPUTED from live APIs. Your ONLY job is to present it cleanly.',
        'RULES:',
        '1. Copy ALL section headers and their data VERBATIM. Do NOT rephrase numbers.',
        '2. You may add ONE short sentence (max 15 words) per ESCENARIO for context.',
        '3. If the user asked about a specific skill (FVG, VWAP, delta, etc.), present ONLY that section.',
        '4. For full analysis, present in order: CONTEXTO GENERAL → ESCENARIOS → ZONAS DE MANIPULACIÓN → ALERTA INSTITUCIONAL → CONCLUSIÓN OPERATIVA.',
        '5. After CONCLUSIÓN OPERATIVA, write "--- END ---" and STOP. Do NOT continue.',
        '6. NEVER add paragraphs of explanation, disclaimers, or repeated text.',
        '7. NEVER switch to a different language mid-response.',
        '8. NEVER generate filler text or restate what was already said.',
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

async function fetchTokenData(
  tokens: string[],
  address?: string,
  tokenData?: TokenDataPoint[],
): Promise<string[]> {
  const perToken: string[] = [];

  // Fetch by address via DexScreener
  if (address) {
    try {
      const pairs = await fetchTokenFromDex(address);
      const pair = pairs[0];
      if (pair) {
        const sym = sanitizeTokenName(pair.baseToken.symbol).toUpperCase();
        perToken.push(
          [
            `## ${sym} Market Data`,
            `${sanitizeTokenName(pair.baseToken.name)} (${sym}) on ${pair.chainId}:`,
            `  Price: $${pair.priceUsd ?? '?'}`,
            `  24h Volume: $${(pair.volume?.h24 ?? 0).toLocaleString()}`,
            `  Liquidity: $${(pair.liquidity?.usd ?? 0).toLocaleString()}`,
            `  24h Change: ${(pair.priceChange?.h24 ?? 0) > 0 ? '+' : ''}${(pair.priceChange?.h24 ?? 0).toFixed(2)}%`,
            `  24h Txns: ${pair.txns?.h24?.buys ?? 0} buys / ${pair.txns?.h24?.sells ?? 0} sells`,
            `  Market Cap: $${(pair.marketCap ?? pair.fdv ?? 0).toLocaleString()}`,
            `  DEX: ${pair.dexId} | Pair: ${pair.pairAddress}`,
          ].join('\n'),
        );
        tokenData?.push({
          symbol: sym,
          price: Number(pair.priceUsd) || 0,
          change24h: pair.priceChange?.h24 ?? 0,
          volume24h: pair.volume?.h24 ?? undefined,
          marketCap: pair.marketCap ?? pair.fdv ?? undefined,
          source: 'dexscreener',
        });
      }
    } catch {
      // skip
    }
  }

  // Fetch named tokens: Binance (primary) -> CoinGecko (fallback) -> DexScreener (fallback)
  // Each token gets its OWN section to prevent data mixing in multi-token queries
  for (const token of tokens.slice(0, 3)) {
    const sym = resolveSymbol(token);

    const lines: string[] = [`## ${sym} Market Data`];

    // Try Binance first — use RT (WebSocket cache → REST fallback) for freshest price
    try {
      const binanceData = await fetchTickerPriceRT(sym);
      if (binanceData) {
        lines.push(
          `${sym} (via Binance, live):`,
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
        tokenData?.push({
          symbol: sym,
          price: binanceData.price,
          change24h: binanceData.change24h,
          source: 'binance',
        });
        perToken.push(lines.join('\n'));
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
          );
          tokenData?.push({
            symbol: sym,
            price: data.price,
            change24h: data.priceChange24h,
            volume24h: data.volume24h,
            marketCap: data.marketCap,
            source: 'coingecko',
          });
          perToken.push(lines.join('\n'));
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
          `${sanitizeTokenName(pair.baseToken.name)} (${sanitizeTokenName(pair.baseToken.symbol)}) on ${pair.chainId}:`,
          `  Price: $${pair.priceUsd ?? '?'}`,
          `  24h Volume: $${(pair.volume?.h24 ?? 0).toLocaleString()}`,
          `  24h Change: ${(pair.priceChange?.h24 ?? 0) > 0 ? '+' : ''}${(pair.priceChange?.h24 ?? 0).toFixed(2)}%`,
        );
        tokenData?.push({
          symbol: sym,
          price: Number(pair.priceUsd) || 0,
          change24h: pair.priceChange?.h24 ?? 0,
          volume24h: pair.volume?.h24 ?? undefined,
          source: 'dexscreener',
        });
        perToken.push(lines.join('\n'));
      }
    } catch {
      // skip
    }
  }

  return perToken;
}

async function fetchTrendingData(): Promise<string | null> {
  try {
    const trending = await fetchTrendingTokens();
    if (trending.length === 0) return null;

    const lines = ['## Trending Tokens (live)'];
    for (const t of trending.slice(0, 10)) {
      lines.push(
        `- ${sanitizeTokenName(t.name)} (${sanitizeTokenName(t.symbol)}) on ${t.chain}: $${t.priceUsd} | 24h: ${t.priceChange24h > 0 ? '+' : ''}${t.priceChange24h.toFixed(1)}% | Vol: $${t.volume24h.toLocaleString()} [${t.source}]`,
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
      const headlines = news.slice(0, 8);
      const lines = [`## Latest Crypto News${symbol ? ` (${symbol})` : ''}`];

      // ML: enhance sentiment labels with ML NLP analysis
      const mlClient = getMLClient();
      if (mlClient) {
        try {
          const texts = headlines.map((n) => n.title);
          const mlResults = await mlClient.analyzeSentimentBatch(texts);
          if (mlResults.length > 0) {
            for (let i = 0; i < headlines.length; i++) {
              const n = headlines[i];
              if (!n) continue;
              const ml = mlResults[i];
              const label = ml
                ? `${ml.sentiment.toUpperCase()} (${(ml.confidence * 100).toFixed(0)}%)`
                : n.sentiment.toUpperCase();
              lines.push(
                `- [${label}] ${sanitizeHeadline(n.title)} (${sanitizeTokenName(n.source.title)}, ${n.publishedAt})`,
              );
            }
            // Aggregate ML sentiment score
            const avgScore = mlResults.reduce((s, r) => s + r.score, 0) / mlResults.length;
            const avgSentiment =
              avgScore > 0.2 ? 'BULLISH' : avgScore < -0.2 ? 'BEARISH' : 'NEUTRAL';
            lines.push(`\nML Aggregate Sentiment: ${avgSentiment} (score: ${avgScore.toFixed(3)})`);
            return lines.join('\n');
          }
        } catch {
          // ML unavailable — fall through to rule-based labels
        }
      }

      // Fallback: use CryptoPanic sentiment labels
      for (const n of headlines) {
        lines.push(
          `- [${n.sentiment.toUpperCase()}] ${sanitizeHeadline(n.title)} (${sanitizeTokenName(n.source.title)}, ${n.publishedAt})`,
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
      const title = (match[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const date = (match[2] ?? '').trim();
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
        `- ${sanitizeTokenName(r.name)} — ${sanitizeExternalData(r.round, 50)} (${amount}) on ${r.chains.join(', ') || 'multi-chain'} [${date}]${r.leadInvestors.length > 0 ? ` Led by: ${r.leadInvestors.map((inv) => sanitizeTokenName(inv)).join(', ')}` : ''}`,
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
      lines.push(
        `- ${sanitizeTokenName(c.name)} (${sanitizeTokenName(c.symbol)}) — MC: ${mcap} | Replies: ${c.reply_count}`,
      );
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
  tokenData?: TokenDataPoint[],
): Promise<string | null> {
  try {
    const pairs = await fetchTokenFromDex(query);
    if (!pairs || pairs.length === 0) {
      return `## DEX Search: "${query.toUpperCase()}"\nToken NOT FOUND on any DEX (DexScreener). It may be too new, delisted, misspelled, or not yet listed. Try searching by contract address instead.`;
    }

    const lines = [`## DEX Data: ${query.toUpperCase()} (via DexScreener, live)`];
    const topPair = pairs[0]; // Safe: we return early above when pairs.length === 0
    if (!topPair) return null;

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

    // Collect structured token data for trade cards (works for memecoins, new projects, etc.)
    tokenData?.push({
      symbol: sanitizeTokenName(topPair.baseToken.symbol).toUpperCase(),
      price: Number(topPair.priceUsd) || 0,
      change24h: topPair.priceChange?.h24 ?? 0,
      volume24h: topPair.volume?.h24 ?? undefined,
      marketCap: topPair.marketCap ?? topPair.fdv ?? undefined,
      source: 'dexscreener',
    });

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

async function fetchBinancePriceData(
  symbols: string[],
  tokenData?: TokenDataPoint[],
): Promise<string[]> {
  try {
    const results = await Promise.allSettled(symbols.map((s) => fetchTickerPriceRT(s)));
    const perToken: string[] = [];

    for (let i = 0; i < symbols.length; i++) {
      const result = results[i];
      if (result && result.status === 'fulfilled') {
        const d = result.value;
        perToken.push(
          `## ${d.symbol} Live Price (Binance)\n${d.symbol}: $${d.price.toLocaleString()} | 24h: ${d.change24h > 0 ? '+' : ''}${d.change24h.toFixed(2)}%`,
        );
        // Only add if not already collected from fetchTokenData
        if (tokenData && !tokenData.some((t) => t.symbol === d.symbol)) {
          tokenData.push({
            symbol: d.symbol,
            price: d.price,
            change24h: d.change24h,
            source: 'binance',
          });
        }
      }
    }

    return perToken;
  } catch {
    return [];
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

async function fetchDerivativesData(tokens: string[]): Promise<string[]> {
  const symbols =
    tokens.length > 0 ? tokens.slice(0, 3).map((t) => resolveSymbol(t)) : ['BTC', 'ETH'];

  try {
    const perToken: string[] = [];

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

      const parts: string[] = [`## ${sym} Derivatives (Binance Futures)`, `${sym}:`];
      if (funding.status === 'fulfilled') {
        const f = funding.value;
        parts.push(`  Funding: ${(f.fundingRate * 100).toFixed(4)}%`);
        parts.push(`  Mark: $${f.markPrice.toLocaleString()}`);
      }
      if (oi.status === 'fulfilled') {
        const o = oi.value;
        parts.push(`  OI: $${(o.notionalValue / 1e9).toFixed(2)}B`);
      }
      if (parts.length > 2) {
        perToken.push(parts.join('\n'));
      }
    }

    return perToken;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Microstructure data fetcher — computes all 8 skills for Ollama path
// ---------------------------------------------------------------------------

async function fetchMicrostructureData(
  tokens: string[],
  tokenData: TokenDataPoint[],
): Promise<string | null> {
  const symbol = tokens[0];
  if (!symbol) return null;
  const sym = resolveSymbol(symbol);

  try {
    // Fetch all raw data in parallel
    const [klines1h, klines15m, ticker, oi, funding, ls, topTrader, taker, ob] =
      await Promise.allSettled([
        fetchKlines(sym, '1h', 100),
        fetchKlines(sym, '15m', 100),
        fetchTickerPriceRT(sym),
        fetchOpenInterest(sym),
        fetchFundingRate(sym),
        fetchLongShortRatio(sym),
        fetchTopTraderRatio(sym),
        fetchTakerBuySellRatio(sym),
        fetchOrderBookDepth(sym),
      ]);

    const k1h = klines1h.status === 'fulfilled' ? klines1h.value : null;
    const k15m = klines15m.status === 'fulfilled' ? klines15m.value : null;
    const price = ticker.status === 'fulfilled' ? ticker.value.price : null;
    const oiVal = oi.status === 'fulfilled' ? oi.value : null;
    const fundingVal = funding.status === 'fulfilled' ? funding.value : null;
    const lsVal = ls.status === 'fulfilled' ? ls.value : null;
    const topTraderVal = topTrader.status === 'fulfilled' ? topTrader.value : null;
    const takerVal = taker.status === 'fulfilled' ? taker.value : null;
    const obVal = ob.status === 'fulfilled' ? ob.value : null;

    if (!k1h || k1h.length < 20 || !price) return null;

    // Push price into tokenData
    tokenData.push({
      symbol: sym,
      price,
      change24h: ticker.status === 'fulfilled' ? ticker.value.change24h : 0,
      source: 'binance',
    });

    // Extract arrays from klines
    const extract = (klines: typeof k1h) => ({
      highs: klines.map((k) => k.high),
      lows: klines.map((k) => k.low),
      closes: klines.map((k) => k.close),
      opens: klines.map((k) => k.open),
      volumes: klines.map((k) => k.volume),
    });

    const d1h = extract(k1h);
    const d15m = k15m && k15m.length >= 20 ? extract(k15m) : null;

    // Run all indicators
    const structure1h = detectMarketStructure(d1h.highs, d1h.lows);
    const structure15m = d15m ? detectMarketStructure(d15m.highs, d15m.lows) : null;
    const atr1h = calculateATR(d1h.highs, d1h.lows, d1h.closes);
    const fvgs = detectFVGs(d1h.highs, d1h.lows, d1h.closes, atr1h);
    const vwap = calculateVWAP(d1h.highs, d1h.lows, d1h.closes, d1h.volumes);
    const volDelta = calculateVolumeDelta(d1h.opens, d1h.closes, d1h.volumes);
    const srZones = detectSRZones(d1h.highs, d1h.lows, d1h.closes);
    const psychLevel = computePsychLevel(price, sym);

    const liqZones = oiVal ? estimateLiquidationZones(price, oiVal.openInterest) : null;

    const latestLs = lsVal?.history?.[0]?.longShortRatio ?? null;
    const latestTopTrader = topTraderVal?.history?.[0]?.longShortRatio ?? null;
    const latestFunding = fundingVal?.fundingRate ?? null;
    const obImbalance = obVal?.imbalanceRatio ?? null;

    const squeeze = detectSqueezeConditions(
      latestFunding ?? 0,
      latestLs ?? 1,
      latestTopTrader ?? 1,
      structure1h,
      volDelta,
      liqZones,
      obImbalance ?? 1,
      price,
      atr1h,
    );

    // Build formatted output
    const lines: string[] = [];
    lines.push(`## ${sym} MICROSTRUCTURE ANALYSIS`);
    lines.push('');

    // CONTEXTO GENERAL
    lines.push('==============================');
    lines.push('CONTEXTO GENERAL');
    lines.push('==============================');
    lines.push(`Precio actual: $${price.toLocaleString()}`);
    lines.push(`Sesgo intradía: ${structure1h?.bias ?? 'unknown'}`);
    lines.push(
      `Estructura en 1H: ${structure1h ? `${structure1h.bias} — secuencia: ${structure1h.sequence.join(', ')}${structure1h.lastBreak ? ` — último break: ${structure1h.lastBreak}` : ''}` : 'N/A'}`,
    );
    if (structure15m) {
      lines.push(
        `Estructura en 15m: ${structure15m.bias} — secuencia: ${structure15m.sequence.join(', ')}${structure15m.lastBreak ? ` — último break: ${structure15m.lastBreak}` : ''}`,
      );
    }
    lines.push(`Nivel psicológico: $${psychLevel.toLocaleString()}`);
    if (vwap) {
      lines.push(
        `VWAP: $${vwap.vwap.toFixed(2)} | Banda superior: $${vwap.upperBand.toFixed(2)} | Banda inferior: $${vwap.lowerBand.toFixed(2)} | Desviación: ${vwap.deviation.toFixed(2)}%`,
      );
    }
    if (volDelta) {
      lines.push(
        `Volume Delta: ${volDelta.delta.toFixed(2)} | Delta MA: ${volDelta.deltaMA.toFixed(2)} | Divergencia: ${volDelta.divergence}`,
      );
    }
    if (latestFunding !== null) {
      lines.push(`Funding Rate: ${(latestFunding * 100).toFixed(4)}%`);
    }
    if (oiVal) {
      lines.push(
        `Open Interest: ${oiVal.openInterest.toLocaleString()} (notional: $${oiVal.notionalValue.toLocaleString()})`,
      );
    }
    if (latestLs !== null) {
      lines.push(`Long/Short Ratio: ${latestLs.toFixed(3)}`);
    }
    if (latestTopTrader !== null) {
      lines.push(`Top Trader L/S: ${latestTopTrader.toFixed(3)}`);
    }
    const latestTaker = takerVal?.history?.[0]?.buySellRatio ?? null;
    if (latestTaker !== null) {
      lines.push(`Taker Buy/Sell Ratio: ${latestTaker.toFixed(3)} (>1 = buy aggression)`);
    }
    if (obVal) {
      lines.push(`Order Book Imbalance: ${obVal.imbalanceRatio.toFixed(3)} (>1 = buy pressure)`);
    }

    // Liquidation zones
    if (liqZones) {
      const longLiqs = liqZones.longLiquidations;
      const shortLiqs = liqZones.shortLiquidations;
      lines.push('');
      lines.push('Liquidaciones estimadas ABAJO (longs):');
      for (const lz of longLiqs) {
        lines.push(
          `  ${lz.leverage}x → $${lz.price.toFixed(2)} (liquidez: $${lz.estimatedLiquidity.toLocaleString()})`,
        );
      }
      lines.push('Liquidaciones estimadas ARRIBA (shorts):');
      for (const lz of shortLiqs) {
        lines.push(
          `  ${lz.leverage}x → $${lz.price.toFixed(2)} (liquidez: $${lz.estimatedLiquidity.toLocaleString()})`,
        );
      }
    }

    // S/R Zones
    if (srZones.length > 0) {
      lines.push('');
      lines.push('Zonas S/R detectadas:');
      for (const z of srZones.slice(0, 8)) {
        lines.push(
          `  $${z.price.toFixed(2)} — ${z.type} (fuerza: ${z.strength.toFixed(0)}, toques: ${z.touches})`,
        );
      }
    }

    // FVGs
    const unfilled = fvgs.filter((f) => !f.filled);
    if (unfilled.length > 0) {
      lines.push('');
      lines.push('Fair Value Gaps (sin llenar):');
      for (const f of unfilled.slice(0, 6)) {
        lines.push(
          `  ${f.type} FVG: $${f.bottom.toFixed(2)} — $${f.top.toFixed(2)} (midpoint: $${f.midpoint.toFixed(2)}, fuerza: ${f.strength.toFixed(2)})`,
        );
      }
    }

    // ESCENARIOS
    const resistances = srZones.filter((z) => z.type === 'resistance').slice(0, 3);
    const supports = srZones.filter((z) => z.type === 'support').slice(0, 3);
    lines.push('');
    lines.push('==============================');
    lines.push('ESCENARIO 1 – BARRIDO ARRIBA (BULL TRAP / SHORT)');
    lines.push('==============================');
    if (resistances.length > 0 && liqZones) {
      const manipZone = resistances[0]!;
      const shortLiqAbove = liqZones.shortLiquidations[0];
      lines.push(`Zona de manipulación: $${manipZone.price.toFixed(2)}`);
      lines.push(`Entrada short: $${(manipZone.price * 1.002).toFixed(2)} (rechazo en zona)`);
      lines.push(`Confirmación: Rechazo en FVG + delta negativo + quiebre de estructura en 5m`);
      const atrLast = atr1h ?? price * 0.01;
      lines.push(`Stop loss: $${(manipZone.price + atrLast * 1.5).toFixed(2)}`);
      for (let i = 0; i < Math.min(supports.length, 3); i++) {
        lines.push(`TP${i + 1}: $${supports[i]!.price.toFixed(2)}`);
      }
      if (shortLiqAbove) {
        lines.push(
          `Liquidez capturada arriba: $${shortLiqAbove.price.toFixed(2)} (${shortLiqAbove.leverage}x shorts)`,
        );
      }
    } else {
      lines.push('Datos insuficientes para este escenario.');
    }

    lines.push('');
    lines.push('==============================');
    lines.push('ESCENARIO 2 – BARRIDO ABAJO (BEAR TRAP / LONG)');
    lines.push('==============================');
    if (supports.length > 0 && liqZones) {
      const manipZone = supports[0]!;
      const longLiqBelow = liqZones.longLiquidations[0];
      lines.push(`Zona de manipulación: $${manipZone.price.toFixed(2)}`);
      lines.push(`Entrada long: $${(manipZone.price * 0.998).toFixed(2)} (rebote en zona)`);
      lines.push(`Confirmación: Rebote en FVG + delta positivo + recuperación de estructura en 5m`);
      const atrLast = atr1h ?? price * 0.01;
      lines.push(`Stop loss: $${(manipZone.price - atrLast * 1.5).toFixed(2)}`);
      for (let i = 0; i < Math.min(resistances.length, 3); i++) {
        lines.push(`TP${i + 1}: $${resistances[i]!.price.toFixed(2)}`);
      }
      if (longLiqBelow) {
        lines.push(
          `Liquidez capturada abajo: $${longLiqBelow.price.toFixed(2)} (${longLiqBelow.leverage}x longs)`,
        );
      }
    } else {
      lines.push('Datos insuficientes para este escenario.');
    }

    // Squeeze scenarios
    if (squeeze.shortSqueeze) {
      lines.push('');
      lines.push('==============================');
      lines.push('ESCENARIO 3 – SHORT SQUEEZE');
      lines.push('==============================');
      lines.push(
        `Shorts atrapados en: $${squeeze.shortSqueeze.trappedZone[0].toFixed(2)} — $${squeeze.shortSqueeze.trappedZone[1].toFixed(2)}`,
      );
      lines.push(`Nivel de ruptura: $${squeeze.shortSqueeze.breakoutLevel.toFixed(2)}`);
      lines.push(`Cascada de liquidaciones: $${squeeze.shortSqueeze.cascadeStart.toFixed(2)}`);
      lines.push(`Entrada: $${squeeze.shortSqueeze.entry.toFixed(2)}`);
      lines.push(`Stop: $${squeeze.shortSqueeze.stopLoss.toFixed(2)}`);
      for (let i = 0; i < squeeze.shortSqueeze.targets.length; i++) {
        lines.push(`Target ${i + 1}: $${squeeze.shortSqueeze.targets[i]!.toFixed(2)}`);
      }
      lines.push(`Probabilidad: ${(squeeze.shortSqueeze.probability * 100).toFixed(0)}%`);
      lines.push(`Razón: ${squeeze.shortSqueeze.reasoning.join(', ')}`);
    }

    if (squeeze.longSqueeze) {
      lines.push('');
      lines.push('==============================');
      lines.push('ESCENARIO 4 – LONG SQUEEZE');
      lines.push('==============================');
      lines.push(
        `Longs atrapados en: $${squeeze.longSqueeze.trappedZone[0].toFixed(2)} — $${squeeze.longSqueeze.trappedZone[1].toFixed(2)}`,
      );
      lines.push(`Nivel de ruptura bajista: $${squeeze.longSqueeze.breakoutLevel.toFixed(2)}`);
      lines.push(`Cascada de liquidaciones: $${squeeze.longSqueeze.cascadeStart.toFixed(2)}`);
      lines.push(`Entrada: $${squeeze.longSqueeze.entry.toFixed(2)}`);
      lines.push(`Stop: $${squeeze.longSqueeze.stopLoss.toFixed(2)}`);
      for (let i = 0; i < squeeze.longSqueeze.targets.length; i++) {
        lines.push(`Target ${i + 1}: $${squeeze.longSqueeze.targets[i]!.toFixed(2)}`);
      }
      lines.push(`Probabilidad: ${(squeeze.longSqueeze.probability * 100).toFixed(0)}%`);
      lines.push(`Razón: ${squeeze.longSqueeze.reasoning.join(', ')}`);
    }

    // Daily manipulation zones
    lines.push('');
    lines.push('==============================');
    lines.push('ZONAS DE MANIPULACIÓN DIARIA');
    lines.push('==============================');
    const manipZones: string[] = [];
    if (structure1h) {
      for (const sh of structure1h.swingHighs.slice(-3)) {
        manipZones.push(`Swing high barreable: $${sh.price.toFixed(2)}`);
      }
      for (const sl of structure1h.swingLows.slice(-3)) {
        manipZones.push(`Swing low barreable: $${sl.price.toFixed(2)}`);
      }
    }
    for (const fvg of unfilled.slice(0, 3)) {
      manipZones.push(
        `FVG ${fvg.type} sin llenar: $${fvg.bottom.toFixed(2)} — $${fvg.top.toFixed(2)}`,
      );
    }
    if (manipZones.length > 0) {
      lines.push(...manipZones);
    } else {
      lines.push('No se detectaron zonas claras de manipulación.');
    }

    // Institutional alert
    let alignedSignals = 0;
    const alertReasons: string[] = [];
    if (
      liqZones &&
      (liqZones.longLiquidations.length > 0 || liqZones.shortLiquidations.length > 0)
    ) {
      alignedSignals++;
      alertReasons.push('clusters de liquidación detectados');
    }
    if (volDelta && volDelta.divergence !== 'none') {
      alignedSignals++;
      alertReasons.push(`divergencia de delta: ${volDelta.divergence}`);
    }
    if (latestFunding !== null && Math.abs(latestFunding) > 0.0005) {
      alignedSignals++;
      alertReasons.push(`funding rate extremo: ${(latestFunding * 100).toFixed(4)}%`);
    }
    if (obImbalance !== null && (obImbalance > 1.5 || obImbalance < 0.67)) {
      alignedSignals++;
      alertReasons.push(`desequilibrio de order book: ${obImbalance.toFixed(3)}`);
    }
    if (squeeze.shortSqueeze || squeeze.longSqueeze) {
      alignedSignals++;
      alertReasons.push('condiciones de squeeze detectadas');
    }

    if (alignedSignals >= 3) {
      lines.push('');
      lines.push('==============================');
      lines.push('⚠️ ALERTA INSTITUCIONAL');
      lines.push('==============================');
      lines.push(`${alignedSignals} señales institucionales alineadas:`);
      lines.push(...alertReasons.map((r) => `  • ${r}`));
    }

    // Conclusion
    lines.push('');
    lines.push('==============================');
    lines.push('CONCLUSIÓN OPERATIVA');
    lines.push('==============================');
    if (structure1h) {
      const bias = structure1h.bias;
      if (bias === 'bullish') {
        lines.push(`Sesgo alcista. Escenario 2 (Bear Trap / Long) tiene mayor probabilidad.`);
        if (supports.length > 0) {
          lines.push(`Buscar entradas long cerca de $${supports[0]!.price.toFixed(2)}.`);
        }
      } else if (bias === 'bearish') {
        lines.push(`Sesgo bajista. Escenario 1 (Bull Trap / Short) tiene mayor probabilidad.`);
        if (resistances.length > 0) {
          lines.push(`Buscar entradas short cerca de $${resistances[0]!.price.toFixed(2)}.`);
        }
      } else {
        lines.push(`Mercado en rango. Esperar quiebre de estructura para confirmar dirección.`);
      }
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query understanding — extracts structured intent from natural language
// NOT hardcoded: uses flexible patterns to understand ANY phrasing/order
// ---------------------------------------------------------------------------

interface ParsedQuery {
  tokens: string[]; // Deduplicated ticker symbols: ['BTC', 'ETH', 'SOL']
  timeframes: { label: string; hours: number }[];
  queryType: string; // 'prediction' | 'analysis' | 'news' | 'trends' | 'general'
  language: 'en' | 'es';
  rawMessage: string;
}

/**
 * Parse the user's message into structured intent.
 * Works regardless of word order, language, or phrasing style.
 */
function parseUserQuery(
  userMessage: string,
  mentionedTokens: string[],
  unknownTokens: string[],
  queryType: string,
): ParsedQuery {
  const lower = userMessage.toLowerCase();

  // Detect language from message content
  const spanishMarkers =
    /\b(predicción|apertura|mañana|precio|mercado|incluyendo|además|también|exactas?|horario|día)\b/i;
  const language: 'en' | 'es' = spanishMarkers.test(lower) ? 'es' : 'en';

  // Deduplicate tokens — dynamically resolve via KNOWN_SYMBOLS (no hardcoded map)
  const allRaw = [...mentionedTokens, ...unknownTokens];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of allRaw) {
    const sym = resolveSymbol(t);
    if (!seen.has(sym)) {
      seen.add(sym);
      tokens.push(sym);
    }
  }

  // Parse timeframes
  const timeframes = parseRequestedTimeframes(userMessage) ?? [];

  return { tokens, timeframes, queryType, language, rawMessage: userMessage };
}

/**
 * Build a structured query breakdown section that tells the model
 * EXACTLY what the user is asking for — tokens, timeframes, format.
 * This prevents the model from ignoring tokens or timeframes.
 */
function buildQueryBreakdown(query: ParsedQuery): string {
  const lines: string[] = [];

  lines.push('## USER QUERY BREAKDOWN (you MUST answer ALL of these)');
  lines.push(`Language: ${query.language === 'es' ? 'Spanish (respond in Spanish)' : 'English'}`);
  lines.push(`Query type: ${query.queryType.toUpperCase()}`);

  if (query.tokens.length > 0) {
    lines.push(`Tokens requested: ${query.tokens.join(', ')} (${query.tokens.length} total)`);
    lines.push(
      `⚠️ You MUST present analysis for ALL ${query.tokens.length} tokens: ${query.tokens.join(', ')}`,
    );
    lines.push(`⚠️ Missing ANY token is a FAILURE. Present each one with its own section.`);
  }

  if (query.timeframes.length > 0) {
    lines.push('');
    lines.push('Timeframes requested by user:');
    for (const tf of query.timeframes) {
      lines.push(`  → ${tf.label}`);
    }
    lines.push(
      '⚠️ Present the USER-REQUESTED TIMEFRAME predictions FIRST and prominently for EACH token.',
    );
    lines.push('⚠️ The user wants predictions at THESE specific times, not generic 24h/7d.');
  } else {
    lines.push(
      'Timeframes: No specific time requested — use default timeframes (scalping → long-term).',
    );
  }

  lines.push('');
  lines.push(
    'FORMAT: For each token, present: Price target → Confidence → Support/Resistance → Risk',
  );
  if (query.tokens.length > 1) {
    lines.push(`ORDER: Present tokens in this order: ${query.tokens.join(' → ')}`);
    lines.push(
      'SEPARATION: Use a clear heading for each token. Never combine or merge data between tokens.',
    );
  }

  return lines.join('\n');
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
    const sym = (m0[1] ?? '').toLowerCase();
    if (!knownSet.has(sym) && !unknowns.includes(sym)) {
      unknowns.push(sym);
    }
  }

  // Pattern 1: ALL-CAPS words (3-10 chars) that look like ticker symbols
  const capsRegex = /\b([A-Z][A-Z0-9]{2,9})\b/g;
  let m;
  while ((m = capsRegex.exec(original)) !== null) {
    const sym = (m[1] ?? '').toLowerCase();
    // Skip common English words that happen to be uppercase
    const SKIP = new Set([
      // Common English words
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
      'FULL',
      'DAY',
      'BUY',
      'SELL',
      'TOP',
      'LOW',
      'HIGH',
      'MAX',
      'MIN',
      'OUT',
      'OFF',
      'YES',
      'WAY',
      'WHAT',
      'WHEN',
      'WHERE',
      'WHY',
      'WHICH',
      'WILL',
      'WITH',
      // Crypto jargon (not tokens)
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
      'CEX',
      'DAO',
      'DPI',
      'OTC',
      'KYC',
      'AML',
      'TPS',
      // Cities (NOT tokens)
      'NYC',
      'LAX',
      'SFO',
      'CHI',
      'ATL',
      'DFW',
      'MIA',
      'BOS',
      'SEA',
      'DEN',
      'LDN',
      'LON',
      'TYO',
      'HKG',
      'SGP',
      'SYD',
      'BER',
      'PAR',
      'DXB',
      'SHA',
      'BJS',
      'MUM',
      'DEL',
      'SAO',
      'MEX',
      'CDG',
      'CDMX',
      // Countries & regions
      'USA',
      'GBR',
      'EUR',
      'JPN',
      'CHN',
      'KOR',
      'AUS',
      'CAN',
      'BRA',
      'IND',
      'RUS',
      'GER',
      'FRA',
      'ITA',
      'ESP',
      'NLD',
      'CHE',
      'SWE',
      'NOR',
      'DNK',
      'FIN',
      'SGP',
      'HKG',
      'TWN',
      'NZL',
      'ZAF',
      'ARE',
      'SAU',
      'ISR',
      'TUR',
      'MEX',
      'ARG',
      'COL',
      'PER',
      'CHL',
      'VEN',
      // Stock exchanges & financial institutions
      'NYSE',
      'CME',
      'LSE',
      'TSE',
      'SSE',
      'BSE',
      'NSE',
      'ASX',
      'TMX',
      'CBOE',
      'NYMEX',
      'COMEX',
      'LBMA',
      'HKEX',
      'JPX',
      'BMV',
      'SEC',
      'CFTC',
      'FDIC',
      'FINRA',
      'SWIFT',
      // Timezones
      'EST',
      'PST',
      'CST',
      'MST',
      'EDT',
      'CDT',
      'MDT',
      'PDT',
      'UTC',
      'GMT',
      'CET',
      'JST',
      'KST',
      'IST',
      'AEST',
      'BST',
      'WET',
      'EET',
      'HST',
      'AKST',
      // Time units & common abbreviations
      'HRS',
      'MIN',
      'SEC',
      'MON',
      'TUE',
      'WED',
      'THU',
      'FRI',
      'SAT',
      'SUN',
      'JAN',
      'FEB',
      'MAR',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
      // Spanish common words that might be CAPS
      'QUE',
      'LOS',
      'LAS',
      'UNA',
      'UNO',
      'DEL',
      'POR',
      'CON',
      'SIN',
      'MAS',
      'HOY',
      'DIA',
      'VER',
    ]);
    if (!knownSet.has(sym) && !SKIP.has(m[1] ?? '') && !unknowns.includes(sym)) {
      unknowns.push(sym);
    }
  }

  // Pattern 2: Words after analysis verbs (e.g., "analyze RIGGED", "audit rigged")
  const lower = original.toLowerCase();
  const verbRegex = /(?:anali[zs]e|audit|scan|check|review|inspect)\s+([a-zA-Z0-9]{2,15})/gi;
  while ((m = verbRegex.exec(lower)) !== null) {
    const token = (m[1] ?? '').toLowerCase();
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
    tokens.length > 0 ? tokens.map((t) => resolveSymbol(t)).join(', ') : 'general market';

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
    tokens.length > 0 ? tokens.map((t) => resolveSymbol(t)).join(', ') : 'target token';
  const lines: string[] = [
    `=== ${tokenLabel} — ANALYSIS REPORT (present to user) ===`,
    `(This report is for ${tokenLabel} ONLY. Do NOT mix with other tokens' data.)`,
    '',
  ];

  // Extract price for the target token (not BTC/ETH baseline)
  const extract = (pattern: RegExp): number | null => {
    const match = joined.match(pattern);
    return match ? parseFloat((match[1] ?? '').replace(/,/g, '')) : null;
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
    const buys = parseInt(buysMatch[1] ?? '0', 10);
    const sells = parseInt(buysMatch[2] ?? '0', 10);
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
    if (flagsMatch && !(flagsMatch[1] ?? '').includes('None'))
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

  const tokenLabel = tokens.map((t) => resolveSymbol(t)).join(', ');
  const signals: string[] = [`## ${tokenLabel} — PRE-COMPUTED SIGNAL ANALYSIS`];
  let signalCount = 0;
  let bullish = 0;
  let bearish = 0;

  // Extract numbers from data using regex
  const extract = (pattern: RegExp): number | null => {
    const match = joined.match(pattern);
    return match ? parseFloat((match[1] ?? '').replace(/,/g, '')) : null;
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
    const buys = parseInt(buysMatch[1] ?? '0', 10);
    const sells = parseInt(buysMatch[2] ?? '0', 10);
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
    const funding = parseFloat(fundingMatch[1] ?? '0');
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
    const ageDays = parseInt(ageMatch[1] ?? '0', 10);
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
  const priceTargets = computePriceTargets(joined, direction, change24h, userMessage, tokenLabel);
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

  // "at HH:MM" or "H:MMam/pm" or "a las HH:MM" — specific clock time (English + Spanish)
  const clockMatch = lower.match(/(?:at|a\s+las?)\s+(\d{1,2}):?(\d{2})?\s*(am|pm|hrs?)?/);
  if (clockMatch) {
    let hour = parseInt(clockMatch[1] ?? '0', 10);
    const minute = parseInt(clockMatch[2] || '0', 10);
    const ampm = clockMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    // Detect timezone context from the message
    const isMexicoTz =
      lower.includes('méxico') || lower.includes('mexico') || lower.includes('cdmx');
    const isEST =
      lower.includes('est') ||
      lower.includes('nyc') ||
      lower.includes('new york') ||
      lower.includes('nueva york');

    const now = new Date();
    const target = new Date(now);

    if (isMexicoTz) {
      // Mexico City is UTC-6 (CST) or UTC-5 (CDT)
      // Set target in UTC: hour + 6 (CST)
      target.setUTCHours(hour + 6, minute, 0, 0);
    } else if (isEST) {
      // EST is UTC-5, EDT is UTC-4
      target.setUTCHours(hour + 5, minute, 0, 0);
    } else {
      target.setHours(hour, minute, 0, 0);
    }

    // If target is in the past, assume tomorrow
    if (target <= now) target.setDate(target.getDate() + 1);

    const hoursFromNow = Math.max(0.08, (target.getTime() - now.getTime()) / 3600000);
    const tzLabel = isMexicoTz ? 'Mexico City' : isEST ? 'EST' : 'local';
    const timeStr =
      `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm || ''}`.trim();
    requested.push({
      label: `At ${timeStr} ${tzLabel} (${hoursFromNow.toFixed(1)}h from now)`,
      hours: hoursFromNow,
    });
  }

  // "in X minutes/hours/days"
  const inMatch = lower.match(/in\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?|days?|weeks?|months?)/);
  if (inMatch) {
    const amount = parseInt(inMatch[1] ?? '0', 10);
    const unit = inMatch[2] ?? '';
    let hours = amount;
    if (unit.startsWith('min')) hours = amount / 60;
    else if (unit.startsWith('day')) hours = amount * 24;
    else if (unit.startsWith('week')) hours = amount * 168;
    else if (unit.startsWith('month')) hours = amount * 720;
    requested.push({ label: `In ${amount} ${unit}`, hours });
  }

  // "tomorrow" / "tonight" / "end of day" — English and Spanish
  // Only add "tomorrow" as separate timeframe if no specific clock time was already parsed
  // (e.g., "a las 7:30 am de mañana" — "mañana" modifies the clock time, not a separate tf)
  const hasSpecificTime = clockMatch !== null;
  if (!hasSpecificTime && (lower.includes('tomorrow') || lower.includes('mañana')))
    requested.push({ label: 'Tomorrow (~24h)', hours: 24 });
  if (lower.includes('tonight') || lower.includes('end of day') || lower.includes('esta noche'))
    requested.push({ label: 'End of day (~8h)', hours: 8 });
  if (
    lower.includes('next week') ||
    lower.includes('próxima semana') ||
    lower.includes('proxima semana')
  )
    requested.push({ label: 'Next week (~168h)', hours: 168 });
  if (
    lower.includes('next month') ||
    lower.includes('próximo mes') ||
    lower.includes('proximo mes')
  )
    requested.push({ label: 'Next month (~720h)', hours: 720 });
  if (lower.includes('end of week') || lower.includes('fin de semana'))
    requested.push({ label: 'End of week', hours: 120 });

  // "apertura de NYC" / "NYC opening" — 9:30 AM EST
  if (lower.includes('apertura') || lower.includes('opening')) {
    const now = new Date();
    const target = new Date(now);
    // NYSE opens at 9:30 AM EST (14:30 UTC)
    target.setUTCHours(14, 30, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    // Skip weekends
    while (target.getUTCDay() === 0 || target.getUTCDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
    const hoursFromNow = Math.max(0.08, (target.getTime() - now.getTime()) / 3600000);
    requested.push({
      label: `NYSE Opening 9:30 AM EST (${hoursFromNow.toFixed(1)}h from now)`,
      hours: hoursFromNow,
    });
  }

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
  tokenLabel = '',
): string | null {
  // Extract current price (handle comma-formatted numbers like $2,111.55)
  const priceMatch = data.match(/Price:\s*\$([0-9,.]+(?:e[+-]?\d+)?)/);
  if (!priceMatch) return null;
  const price = parseFloat((priceMatch[1] ?? '').replace(/,/g, ''));
  if (isNaN(price) || price <= 0) return null;

  // Extract liquidity and market cap for context
  const liqMatch = data.match(/Liquidity:\s*\$([0-9,]+)/);
  const mcapMatch = data.match(/Market Cap:\s*\$([0-9,]+)/);
  const liquidity = liqMatch ? parseFloat((liqMatch[1] ?? '').replace(/,/g, '')) : 0;
  const mcap = mcapMatch ? parseFloat((mcapMatch[1] ?? '').replace(/,/g, '')) : 0;

  // Calculate hourly volatility from 24h change
  const dailyVol = Math.abs(change24h ?? 10) / 100;
  const vol = Math.min(dailyVol, 0.5);
  const hourlyVol = vol / Math.sqrt(24); // Scale volatility to hourly

  const label = tokenLabel || 'TOKEN';
  const lines: string[] = [
    `## ${label} PRICE PREDICTION SCENARIOS (for ${label} ONLY — NOT for any other token)`,
  ];
  lines.push(`  Token: ${label}`);
  lines.push(
    `  ${label} Current Price: $${price < 0.01 ? price.toExponential(4) : price.toLocaleString()}`,
  );
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
    lines.push(`  ${label} — USER-REQUESTED TIMEFRAME (present FIRST):`);
    for (const { label: tfLabel, hours } of requestedTimes) {
      const s = scenario(hours);
      lines.push(`  ${label} @ ${tfLabel}:`);
      lines.push(`    ${label} Bullish: $${formatPrice(s.bull)} (${pctStr(s.bull)})`);
      lines.push(`    ${label} Most likely: $${formatPrice(s.likely)} (${pctStr(s.likely)})`);
      lines.push(`    ${label} Bearish: $${formatPrice(s.bear)} (${pctStr(s.bear)})`);
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
  lines.push(`  ${label} SCALPING / INTRADAY:`);
  lines.push(
    `    ${label} 5 min:  Bull $${formatPrice(tf5m.bull)} (${pctStr(tf5m.bull)}) | Likely $${formatPrice(tf5m.likely)} | Bear $${formatPrice(tf5m.bear)} (${pctStr(tf5m.bear)})`,
  );
  lines.push(
    `    ${label} 15 min: Bull $${formatPrice(tf15m.bull)} (${pctStr(tf15m.bull)}) | Likely $${formatPrice(tf15m.likely)} | Bear $${formatPrice(tf15m.bear)} (${pctStr(tf15m.bear)})`,
  );
  lines.push(
    `    ${label} 1 hour: Bull $${formatPrice(tf1h.bull)} (${pctStr(tf1h.bull)}) | Likely $${formatPrice(tf1h.likely)} | Bear $${formatPrice(tf1h.bear)} (${pctStr(tf1h.bear)})`,
  );
  lines.push(
    `    ${label} 4 hour: Bull $${formatPrice(tf4h.bull)} (${pctStr(tf4h.bull)}) | Likely $${formatPrice(tf4h.likely)} | Bear $${formatPrice(tf4h.bear)} (${pctStr(tf4h.bear)})`,
  );

  // Short-term (1-7 days)
  const tf1d = scenario(24);
  const tf7d = scenario(168);
  lines.push('');
  lines.push(`  ${label} SHORT-TERM (1-7 days):`);
  lines.push(
    `    ${label} 1 day:  Bull $${formatPrice(tf1d.bull)} (${pctStr(tf1d.bull)}) | Likely $${formatPrice(tf1d.likely)} | Bear $${formatPrice(tf1d.bear)} (${pctStr(tf1d.bear)})`,
  );
  lines.push(
    `    ${label} 7 days: Bull $${formatPrice(tf7d.bull)} (${pctStr(tf7d.bull)}) | Likely $${formatPrice(tf7d.likely)} | Bear $${formatPrice(tf7d.bear)} (${pctStr(tf7d.bear)})`,
  );

  // Medium-term (1-4 weeks)
  const tf2w = scenario(336);
  const tf1m = scenario(720);
  lines.push('');
  lines.push(`  ${label} MEDIUM-TERM (1-4 weeks):`);
  lines.push(
    `    ${label} 2 weeks: Bull $${formatPrice(tf2w.bull)} (${pctStr(tf2w.bull)}) | Likely $${formatPrice(tf2w.likely)} | Bear $${formatPrice(tf2w.bear)} (${pctStr(tf2w.bear)})`,
  );
  lines.push(
    `    ${label} 1 month: Bull $${formatPrice(tf1m.bull)} (${pctStr(tf1m.bull)}) | Likely $${formatPrice(tf1m.likely)} | Bear $${formatPrice(tf1m.bear)} (${pctStr(tf1m.bear)})`,
  );

  // Long-term (1-3 months)
  const tf3m = scenario(2160);
  lines.push('');
  lines.push(`  ${label} LONG-TERM (1-3 months):`);
  lines.push(
    `    ${label} 3 months: Bull $${formatPrice(tf3m.bull)} (${pctStr(tf3m.bull)}) | Bear $${formatPrice(tf3m.bear)} (${pctStr(tf3m.bear)})`,
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
  lines.push(`  ${label} KEY LEVELS:`);
  lines.push(
    `    ${label} Support: $${formatPrice(price * 0.95)} / $${formatPrice(price * 0.9)} / $${formatPrice(price * 0.8)}`,
  );
  lines.push(
    `    ${label} Resistance: $${formatPrice(price * 1.05)} / $${formatPrice(price * 1.1)} / $${formatPrice(price * 1.2)}`,
  );

  lines.push('');
  if (requestedTimes) {
    lines.push(
      `  IMPORTANT: Present the ${label} USER-REQUESTED TIMEFRAME predictions FIRST and prominently.`,
    );
  }
  lines.push(
    `  Present ALL ${label} timeframes from scalping to long-term. Use the exact dollar values above. These are for ${label} ONLY.`,
  );

  return lines.join('\n');
}
