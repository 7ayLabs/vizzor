'use client';

import useSWR, { type KeyedMutator } from 'swr';
import { API_BASE } from '@/lib/constants';

const fetcher = async (path: string) => {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};

export function useApi<T>(
  path: string | null,
  opts?: { refreshInterval?: number },
): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
} {
  const { data, error, isLoading, mutate } = useSWR<T>(path, fetcher, {
    refreshInterval: opts?.refreshInterval ?? 30000,
    revalidateOnFocus: false,
  });
  return { data, error, isLoading, mutate };
}
