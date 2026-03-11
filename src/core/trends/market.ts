export interface MarketData {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  priceChange7d: number;
  volume24h: number;
  marketCap: number;
  rank: number | null;
}

export interface MarketTrend {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  signals: string[];
}

export async function fetchMarketData(symbol: string): Promise<MarketData | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(symbol.toLowerCase())}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h,7d`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>[];
    if (!data || data.length === 0) return null;

    const coin = data[0];
    if (!coin) return null;

    return {
      symbol: String(coin['symbol'] ?? '').toUpperCase(),
      name: String(coin['name'] ?? ''),
      price: Number(coin['current_price'] ?? 0),
      priceChange24h: Number(coin['price_change_percentage_24h'] ?? 0),
      priceChange7d: Number(coin['price_change_percentage_7d_in_currency'] ?? 0),
      volume24h: Number(coin['total_volume'] ?? 0),
      marketCap: Number(coin['market_cap'] ?? 0),
      rank: coin['market_cap_rank'] != null ? Number(coin['market_cap_rank']) : null,
    };
  } catch {
    return null;
  }
}

export function analyzeTrend(data: MarketData): MarketTrend {
  const signals: string[] = [];
  let score = 50;

  if (data.priceChange24h > 5) {
    score += 15;
    signals.push(`Strong 24h gain: +${data.priceChange24h.toFixed(2)}%`);
  } else if (data.priceChange24h < -5) {
    score -= 15;
    signals.push(`Significant 24h drop: ${data.priceChange24h.toFixed(2)}%`);
  }

  if (data.priceChange7d > 10) {
    score += 20;
    signals.push(`Bullish weekly trend: +${data.priceChange7d.toFixed(2)}%`);
  } else if (data.priceChange7d < -10) {
    score -= 20;
    signals.push(`Bearish weekly trend: ${data.priceChange7d.toFixed(2)}%`);
  }

  if (data.volume24h > data.marketCap * 0.1) {
    signals.push('High volume relative to market cap');
    score += 5;
  }

  const direction: MarketTrend['direction'] =
    score > 60 ? 'bullish' : score < 40 ? 'bearish' : 'neutral';

  return {
    direction,
    strength: Math.max(0, Math.min(100, score)),
    signals,
  };
}
