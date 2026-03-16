'use client';

import { useEffect, useState } from 'react';

export function useSSE<T>(url: string): { data: T | null; error: Error | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        setData(JSON.parse(event.data) as T);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    };

    eventSource.onerror = () => {
      setError(new Error('SSE connection lost'));
      eventSource.close();
    };

    return () => eventSource.close();
  }, [url]);

  return { data, error };
}
