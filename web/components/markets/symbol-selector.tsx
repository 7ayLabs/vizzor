'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { CryptoIcon } from '@/components/ui/crypto-icon';

interface SearchResult {
  symbol: string;
  name: string;
  chain: string;
}

const DEFAULT_OPTIONS: SearchResult[] = [
  { symbol: 'BTC', name: 'Bitcoin', chain: 'ETH' },
  { symbol: 'ETH', name: 'Ethereum', chain: 'ETH' },
  { symbol: 'SOL', name: 'Solana', chain: 'SOL' },
];

export function SymbolSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>(DEFAULT_OPTIONS);
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults(DEFAULT_OPTIONS);
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ results: SearchResult[] }>(
          `/v1/market/dex/search?q=${encodeURIComponent(query)}`,
        );
        setResults(data.results?.length ? data.results : DEFAULT_OPTIONS);
      } catch {
        setResults(DEFAULT_OPTIONS);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={isOpen ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search symbol..."
        className="bg-[var(--background)] border border-[var(--border)] rounded px-3 py-1.5 text-sm w-44 focus:outline-none focus:border-[var(--primary)]"
      />
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-20 max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.symbol}
              onClick={() => {
                onChange(r.symbol);
                setQuery('');
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--card-hover)] flex justify-between items-center"
            >
              <span className="flex items-center gap-1.5">
                <CryptoIcon symbol={r.symbol} size={14} />
                <span className="font-medium">{r.symbol}</span>
                <span className="text-[var(--muted)]">{r.name}</span>
              </span>
              <span className="text-[10px] text-[var(--muted)]">{r.chain}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
