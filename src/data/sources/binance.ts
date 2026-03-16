// ---------------------------------------------------------------------------
// Binance public API client — no auth required, 1200 req/min
// https://binance-docs.github.io/apidocs/spot/en/
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.binance.com/api/v3';
const FUTURES_URL = 'https://fapi.binance.com/fapi/v1';
const FUTURES_DATA_URL = 'https://fapi.binance.com/futures/data';

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

export interface OrderBookDepth {
  symbol: string;
  bids: [number, number][]; // [price, qty][] sorted desc
  asks: [number, number][]; // [price, qty][] sorted asc
  bidWallZones: { price: number; totalQty: number }[];
  askWallZones: { price: number; totalQty: number }[];
  imbalanceRatio: number; // sum(bids) / sum(asks) — >1 = buy pressure
}

export interface LongShortRatio {
  symbol: string;
  period: string;
  history: {
    timestamp: number;
    longAccount: number;
    shortAccount: number;
    longShortRatio: number;
  }[];
}

export interface TakerBuySellRatio {
  symbol: string;
  period: string;
  history: { timestamp: number; buySellRatio: number; buyVol: number; sellVol: number }[];
}

export interface TopTraderRatio {
  symbol: string;
  period: string;
  history: {
    timestamp: number;
    longAccount: number;
    shortAccount: number;
    longShortRatio: number;
  }[];
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
  }>(`${BASE_URL}/ticker/24hr?symbol=${encodeURIComponent(pair)}`);

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
    `${BASE_URL}/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`,
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
  }>(`${BASE_URL}/ticker/bookTicker?symbol=${encodeURIComponent(pair)}`);

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
  >(`${FUTURES_URL}/premiumIndex?symbol=${encodeURIComponent(pair)}`);

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
      `${FUTURES_URL}/openInterest?symbol=${encodeURIComponent(pair)}`,
    ),
    fetchJson<{ symbol: string; lastPrice: string }>(
      `${FUTURES_URL}/ticker/price?symbol=${encodeURIComponent(pair)}`,
    ),
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
// Futures Microstructure API (public, no auth)
// ---------------------------------------------------------------------------

/**
 * Fetch full order book depth from Binance Futures.
 * Computes bid/ask wall clusters and imbalance ratio.
 */
export async function fetchOrderBookDepth(symbol: string, limit = 20): Promise<OrderBookDepth> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<{ bids: [string, string][]; asks: [string, string][] }>(
    `${FUTURES_URL}/depth?symbol=${encodeURIComponent(pair)}&limit=${limit}`,
  );

  const bids: [number, number][] = data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]);
  const asks: [number, number][] = data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]);

  // Cluster bids/asks into wall zones (group within 0.1% price bands)
  const clusterWalls = (levels: [number, number][]): { price: number; totalQty: number }[] => {
    if (levels.length === 0) return [];
    const tolerance = (levels[0]?.[0] ?? 0) * 0.001; // 0.1% of reference price
    const clusters: { price: number; totalQty: number }[] = [];
    let clusterPrice = levels[0]![0];
    let clusterQty = 0;
    for (const [price, qty] of levels) {
      if (Math.abs(price - clusterPrice) <= tolerance) {
        clusterQty += qty;
      } else {
        if (clusterQty > 0) clusters.push({ price: clusterPrice, totalQty: clusterQty });
        clusterPrice = price;
        clusterQty = qty;
      }
    }
    if (clusterQty > 0) clusters.push({ price: clusterPrice, totalQty: clusterQty });
    return clusters.sort((a, b) => b.totalQty - a.totalQty).slice(0, 5);
  };

  const totalBidQty = bids.reduce((s, [, q]) => s + q, 0);
  const totalAskQty = asks.reduce((s, [, q]) => s + q, 0);

  return {
    symbol: symbol.toUpperCase(),
    bids,
    asks,
    bidWallZones: clusterWalls(bids),
    askWallZones: clusterWalls(asks),
    imbalanceRatio: totalAskQty > 0 ? totalBidQty / totalAskQty : 1,
  };
}

/**
 * Fetch global long/short account ratio history.
 */
export async function fetchLongShortRatio(
  symbol: string,
  period = '1h',
  limit = 5,
): Promise<LongShortRatio> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<
    { timestamp: number; longAccount: string; shortAccount: string; longShortRatio: string }[]
  >(
    `${FUTURES_DATA_URL}/globalLongShortAccountRatio?symbol=${encodeURIComponent(pair)}&period=${period}&limit=${limit}`,
  );

  return {
    symbol: symbol.toUpperCase(),
    period,
    history: data.map((d) => ({
      timestamp: d.timestamp,
      longAccount: parseFloat(d.longAccount),
      shortAccount: parseFloat(d.shortAccount),
      longShortRatio: parseFloat(d.longShortRatio),
    })),
  };
}

/**
 * Fetch top trader long/short ratio (highest positioning accounts).
 */
export async function fetchTopTraderRatio(
  symbol: string,
  period = '1h',
  limit = 5,
): Promise<TopTraderRatio> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<
    { timestamp: number; longAccount: string; shortAccount: string; longShortRatio: string }[]
  >(
    `${FUTURES_DATA_URL}/topLongShortAccountRatio?symbol=${encodeURIComponent(pair)}&period=${period}&limit=${limit}`,
  );

  return {
    symbol: symbol.toUpperCase(),
    period,
    history: data.map((d) => ({
      timestamp: d.timestamp,
      longAccount: parseFloat(d.longAccount),
      shortAccount: parseFloat(d.shortAccount),
      longShortRatio: parseFloat(d.longShortRatio),
    })),
  };
}

/**
 * Fetch taker buy/sell volume ratio.
 */
export async function fetchTakerBuySellRatio(
  symbol: string,
  period = '1h',
  limit = 5,
): Promise<TakerBuySellRatio> {
  const pair = resolvePair(symbol);
  const data = await fetchJson<
    { timestamp: number; buySellRatio: string; buyVol: string; sellVol: string }[]
  >(
    `${FUTURES_DATA_URL}/takerlongshortRatio?symbol=${encodeURIComponent(pair)}&period=${period}&limit=${limit}`,
  );

  return {
    symbol: symbol.toUpperCase(),
    period,
    history: data.map((d) => ({
      timestamp: d.timestamp,
      buySellRatio: parseFloat(d.buySellRatio),
      buyVol: parseFloat(d.buyVol),
      sellVol: parseFloat(d.sellVol),
    })),
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
 * Fetch ticker price with real-time WebSocket cache fallback.
 * Checks the WS price cache first, falls back to REST.
 */
export async function fetchTickerPriceRT(symbol: string): Promise<TickerPrice> {
  // Try WebSocket cache first
  const { getWSManager } = await import('./ws-manager.js');
  const wsManager = getWSManager();
  if (wsManager) {
    const wsPrice = wsManager.getLatestPrice(symbol);
    if (wsPrice !== null) {
      return {
        symbol: symbol.toUpperCase(),
        price: wsPrice,
        change24h: 0, // WS cache doesn't track 24h change
      };
    }
  }
  // Fallback to REST
  return fetchTickerPrice(symbol);
}

/**
 * Check if a symbol exists on Binance.
 */
export async function isValidSymbol(symbol: string): Promise<boolean> {
  try {
    const pair = resolvePair(symbol);
    await fetchJson(`${BASE_URL}/ticker/price?symbol=${encodeURIComponent(pair)}`);
    return true;
  } catch {
    return false;
  }
}
