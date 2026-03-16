'use client';

import { useState } from 'react';

export function GenericCard({ result }: { tool?: string; result: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(result, null, 2);
  const isLong = json.length > 200;

  return (
    <div className="p-3">
      <pre className="text-[var(--muted)] overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] max-h-60 overflow-y-auto">
        {expanded || !isLong ? json : json.slice(0, 200) + '...'}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] text-[var(--primary)] hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
