'use client';

import { useApi } from '@/hooks/use-api';
import type { MLHealth } from '@/lib/types';

export function SystemStatus() {
  const { data: health } = useApi<{ status: string }>('/health');
  const { data: ml } = useApi<MLHealth>('/v1/market/ml-health');

  const apiOk = !!health;
  const mlOk = ml?.available === true;

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--muted)] px-1">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${apiOk ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--danger)]'}`}
        />
        <span>API</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${mlOk ? 'bg-[var(--success)] pulse-dot' : 'bg-[var(--muted)]'}`}
        />
        <span>ML</span>
      </div>
    </div>
  );
}
