// ---------------------------------------------------------------------------
// Binance public API client — no auth required, 1200 req/min
// https://binance-docs.github.io/apidocs/spot/en/
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.binance.com/api/v3';
const FUTURES_URL = 'https://fapi.binance.com/fapi/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TickerPrice {
  symbol: string;
  price: number;
  change24h: number;
}

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
}

export interface OrderBookSummary {
  symbol: string;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
  spread: number;
  spreadPct: number;
}

export interface FundingRate {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
}

export interface OpenInterest {
  symbol: string;
  openInterest: number;
  notionalValue: number;
}

// ---------------------------------------------------------------------------
// Symbol mapping: common names -> Binance trading pairs
// ---------------------------------------------------------------------------

const SYMBOL_MAP: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  BNB: 'BNBUSDT',
  XRP: 'XRPUSDT',
  ADA: 'ADAUSDT',
  DOGE: 'DOGEUSDT',
  DOT: 'DOTUSDT',
  AVAX: 'AVAXUSDT',
  MATIC: 'MATICUSDT',
  LINK: 'LINKUSDT',
  UNI: 'UNIUSDT',
  ATOM: 'ATOMUSDT',
  NEAR: 'NEARUSDT',
  ARB: 'ARBUSDT',
  OP: 'OPUSDT',
  SUI: 'SUIUSDT',
  APT: 'APTUSDT',
  PEPE: 'PEPEUSDT',
  SHIB: 'SHIBUSDT',
  FLOKI: 'FLOKIUSDT',
  BONK: 'BONKUSDT',
  WIF: 'WIFUSDT',
};

function resolvePair(symbol: string): string {
  const upper = symbol.toUpperCase();
  return SYMBOL_MAP[upper] ?? `${upper}USDT`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Spot API
// ---------------------------------------------------------------------------

/**
 * Fetch current price and 24h change for a symbol.
 * Uses Binance 24hr ticker — single request, very reliable.
 */
export async function fetchTickerPrice(symbol: string): Promise<TickerPrice> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }>(`${BASE_URL}/ticker/24hr?symbol=${pair}`);

  return {
    symbol: symbol.toUpperCase(),
    price: parseFloat(data.lastPrice),
    change24h: parseFloat(data.priceChangePercent),
  };
}

/**
 * Fetch prices for multiple symbols in one request.
 */
export async function fetchMultipleTickerPrices(
  symbols: string[],
): Promise<Map<string, TickerPrice>> {
  const pairs = symbols.map(resolvePair);
  const encoded = encodeURIComponent(JSON.stringify(pairs));
  const data = await fetchJson<{ symbol: string; lastPrice: string; priceChangePercent: string }[]>(
    `${BASE_URL}/ticker/24hr?symbols=${encoded}`,
  );

  const result = new Map<string, TickerPrice>();
  for (const item of data) {
    // Reverse lookup from pair to short symbol
    const short =
      Object.entries(SYMBOL_MAP).find(([, v]) => v === item.symbol)?.[0] ??
      item.symbol.replace('USDT', '');
    result.set(short, {
      symbol: short,
      price: parseFloat(item.lastPrice),
      change24h: parseFloat(item.priceChangePercent),
    });
  }
  return result;
}

/**
 * Fetch kline (candlestick) data.
 * Intervals: 1m, 5m, 15m, 1h, 4h, 1d, 1w
 */
export async function fetchKlines(symbol: string, interval: string, limit = 100): Promise<Kline[]> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<(string | number)[][]>(
    `${BASE_URL}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
  );

  return data.map((k) => ({
    openTime: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
    closeTime: Number(k[6]),
    quoteVolume: parseFloat(String(k[7])),
    trades: Number(k[8]),
  }));
}

/**
 * Fetch order book depth summary (best bid/ask + spread).
 */
export async function fetchOrderBookSummary(symbol: string): Promise<OrderBookSummary> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<{
    bidPrice: string;
    bidQty: string;
    askPrice: string;
    askQty: string;
  }>(`${BASE_URL}/ticker/bookTicker?symbol=${pair}`);

  const bid = parseFloat(data.bidPrice);
  const ask = parseFloat(data.askPrice);

  return {
    symbol: symbol.toUpperCase(),
    bidPrice: bid,
    bidQty: parseFloat(data.bidQty),
    askPrice: ask,
    askQty: parseFloat(data.askQty),
    spread: ask - bid,
    spreadPct: bid > 0 ? ((ask - bid) / bid) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Futures API (public, no auth for read-only)
// ---------------------------------------------------------------------------

/**
 * Fetch current funding rate for a futures symbol.
 */
export async function fetchFundingRate(symbol: string): Promise<FundingRate> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<
    { symbol: string; fundingRate: string; fundingTime: number; markPrice: string }[]
  >(`${FUTURES_URL}/premiumIndex?symbol=${pair}`);

  const item = data[0];
  if (!item) throw new Error(`No funding data for ${pair}`);

  return {
    symbol: symbol.toUpperCase(),
    fundingRate: parseFloat(item.fundingRate),
    fundingTime: item.fundingTime,
    markPrice: parseFloat(item.markPrice),
  };
}

/**
 * Fetch open interest for a futures symbol.
 */
export async function fetchOpenInterest(symbol: string): Promise<OpenInterest> {
  const pair = resolvePair(symbol);
  const [oiData, tickerData] = await Promise.all([
    fetchJson<{ symbol: string; openInterest: string }>(
      `${FUTURES_URL}/openInterest?symbol=${pair}`,
    ),
    fetchJson<{ symbol: string; lastPrice: string }>(`${FUTURES_URL}/ticker/price?symbol=${pair}`),
  ]);

  const oi = parseFloat(oiData.openInterest);
  const price = parseFloat(tickerData.lastPrice);

  return {
    symbol: symbol.toUpperCase(),
    openInterest: oi,
    notionalValue: oi * price,
  };
}

// ---------------------------------------------------------------------------
// Market overview
// ---------------------------------------------------------------------------

export interface Ticker24hr {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
}

/**
 * Fetch all USDT pairs sorted by 24h price change percentage.
 * Returns the top N gainers and top N losers.
 */
export async function fetchTopGainersLosers(limit = 10): Promise<{
  gainers: Ticker24hr[];
  losers: Ticker24hr[];
}> {
  const data = await fetchJson<
    {
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      volume: string;
      quoteVolume: string;
      highPrice: string;
      lowPrice: string;
    }[]
  >(`${BASE_URL}/ticker/24hr`);

  const usdtPairs = data
    .filter((t) => t.symbol.endsWith('USDT') && !t.symbol.includes('_'))
    .map((t) => ({
      symbol: t.symbol.replace('USDT', ''),
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.volume),
      quoteVolume: parseFloat(t.quoteVolume),
      highPrice: parseFloat(t.highPrice),
      lowPrice: parseFloat(t.lowPrice),
    }))
    .filter((t) => t.quoteVolume > 100_000); // filter dust pairs

  const sorted = [...usdtPairs].sort((a, b) => b.change24h - a.change24h);
  return {
    gainers: sorted.slice(0, limit),
    losers: sorted.slice(-limit).reverse(),
  };
}

/**
 * Check if a symbol exists on Binance.
 */
export async function isValidSymbol(symbol: string): Promise<boolean> {
  try {
    const pair = resolvePair(symbol);
    await fetchJson(`${BASE_URL}/ticker/price?symbol=${pair}`);
    return true;
  } catch {
    return false;
  }
}
