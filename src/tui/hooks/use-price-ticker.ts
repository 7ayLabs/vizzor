import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTickerPrice } from '../../data/sources/binance.js';
import { TICKER_DEFAULTS } from '../../config/constants.js';

const REFRESH_INTERVAL = 30_000;

export interface TickerEntry {
  symbol: string;
  geckoId: string;
  price: number;
  change24h: number;
  loading: boolean;
  error: boolean;
}

export interface UsePriceTickerResult {
  entries: TickerEntry[];
  isRefreshing: boolean;
  selectedIndex: number | null;
  addSymbol: (geckoId: string, symbol: string) => void;
  removeSymbol: (geckoId: string) => void;
  selectNext: () => void;
  selectPrev: () => void;
  clearSelection: () => void;
  getSelected: () => TickerEntry | null;
}

export function usePriceTicker(): UsePriceTickerResult {
  const [entries, setEntries] = useState<TickerEntry[]>(
    TICKER_DEFAULTS.map((t) => ({
      symbol: t.symbol,
      geckoId: t.geckoId,
      price: 0,
      change24h: 0,
      loading: true,
      error: false,
    })),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastGoodRef = useRef<Map<string, { price: number; change24h: number }>>(new Map());

  const fetchAll = useCallback(async (current: TickerEntry[]): Promise<void> => {
    setIsRefreshing(true);
    const symbols = current.map((e) => e.symbol);
    const results = await Promise.allSettled(symbols.map((s) => fetchTickerPrice(s)));

    setEntries((prev) =>
      prev.map((entry, i) => {
        const result = results[i];
        if (result && result.status === 'fulfilled' && result.value) {
          const data = result.value;
          lastGoodRef.current.set(entry.geckoId, {
            price: data.price,
            change24h: data.change24h,
          });
          return {
            ...entry,
            price: data.price,
            change24h: data.change24h,
            loading: false,
            error: false,
          };
        }
        // Preserve last known good values instead of showing error
        const cached = lastGoodRef.current.get(entry.geckoId);
        if (cached) {
          return {
            ...entry,
            price: cached.price,
            change24h: cached.change24h,
            loading: false,
            error: false,
          };
        }
        // Only show error if we never had data
        return { ...entry, loading: false, error: true };
      }),
    );
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    void fetchAll(entries);
    intervalRef.current = setInterval(() => {
      setEntries((current) => {
        void fetchAll(current);
        return current;
      });
    }, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAll]);

  const addSymbol = useCallback(
    (geckoId: string, symbol: string): void => {
      setEntries((prev) => {
        if (prev.some((e) => e.geckoId === geckoId)) return prev;
        const newEntry: TickerEntry = {
          symbol: symbol.toUpperCase(),
          geckoId,
          price: 0,
          change24h: 0,
          loading: true,
          error: false,
        };
        const updated = [...prev, newEntry];
        void fetchAll(updated);
        return updated;
      });
    },
    [fetchAll],
  );

  const removeSymbol = useCallback((geckoId: string): void => {
    setEntries((prev) => prev.filter((e) => e.geckoId !== geckoId));
    lastGoodRef.current.delete(geckoId);
  }, []);

  const selectNext = useCallback((): void => {
    setEntries((current) => {
      setSelectedIndex((prev) => {
        if (prev === null) return 0;
        return prev < current.length - 1 ? prev + 1 : 0;
      });
      return current;
    });
  }, []);

  const selectPrev = useCallback((): void => {
    setEntries((current) => {
      setSelectedIndex((prev) => {
        if (prev === null) return current.length - 1;
        return prev > 0 ? prev - 1 : current.length - 1;
      });
      return current;
    });
  }, []);

  const clearSelection = useCallback((): void => {
    setSelectedIndex(null);
  }, []);

  const getSelected = useCallback((): TickerEntry | null => {
    if (selectedIndex === null) return null;
    return entries[selectedIndex] ?? null;
  }, [selectedIndex, entries]);

  return {
    entries,
    isRefreshing,
    selectedIndex,
    addSymbol,
    removeSymbol,
    selectNext,
    selectPrev,
    clearSelection,
    getSelected,
  };
}
