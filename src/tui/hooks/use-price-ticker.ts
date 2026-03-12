import { useState, useEffect, useRef } from 'react';
import { fetchMarketData } from '../../core/trends/market.js';

const TICKER_SYMBOLS = ['bitcoin', 'ethereum', 'solana'];
const REFRESH_INTERVAL = 60_000;

export interface TickerEntry {
  symbol: string;
  price: number;
  change24h: number;
  loading: boolean;
  error: boolean;
}

export function usePriceTicker(): {
  entries: TickerEntry[];
  isRefreshing: boolean;
} {
  const [entries, setEntries] = useState<TickerEntry[]>(
    TICKER_SYMBOLS.map((s) => ({
      symbol: s === 'bitcoin' ? 'BTC' : s === 'ethereum' ? 'ETH' : 'SOL',
      price: 0,
      change24h: 0,
      loading: true,
      error: false,
    })),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchAll = async (): Promise<void> => {
      setIsRefreshing(true);
      const results = await Promise.allSettled(TICKER_SYMBOLS.map((s) => fetchMarketData(s)));

      setEntries(
        results.map((result, i) => {
          const fallbackSym =
            TICKER_SYMBOLS[i] === 'bitcoin'
              ? 'BTC'
              : TICKER_SYMBOLS[i] === 'ethereum'
                ? 'ETH'
                : 'SOL';
          if (result.status === 'fulfilled' && result.value) {
            return {
              symbol: result.value.symbol,
              price: result.value.price,
              change24h: result.value.priceChange24h,
              loading: false,
              error: false,
            };
          }
          return {
            symbol: fallbackSym,
            price: 0,
            change24h: 0,
            loading: false,
            error: true,
          };
        }),
      );
      setIsRefreshing(false);
    };

    void fetchAll();
    intervalRef.current = setInterval(() => void fetchAll(), REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { entries, isRefreshing };
}
