'use client';

import { useApi } from '@/hooks/use-api';
import { formatRelativeTime, sentimentColor } from '@/lib/utils';
import type { NewsItem } from '@/lib/types';

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const color = sentimentColor(sentiment);
  const isPositive = sentiment === 'bullish' || sentiment === 'positive';
  const isNegative = sentiment === 'bearish' || sentiment === 'negative';
  const bg = isPositive
    ? 'var(--success-bg)'
    : isNegative
      ? 'var(--danger-bg)'
      : 'rgba(107, 107, 107, 0.15)';

  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase"
      style={{ background: bg, color }}
    >
      {sentiment}
    </span>
  );
}

export function NewsFeed() {
  const { data, error } = useApi<{ news: NewsItem[] }>('/v1/market/news');
  const items = data?.news ?? [];

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl p-3 sm:p-4 animate-fade-up stagger-6">
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-newspaper text-xs text-white/50" />
        <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          Latest News
        </h3>
      </div>
      <div className="max-h-60 sm:max-h-80 overflow-y-auto space-y-2">
        {error ? (
          <p className="text-xs text-[var(--text-muted)] text-center py-4">News feed unavailable</p>
        ) : items.length > 0 ? (
          items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-1.5 border-b border-white/[0.06] last:border-0"
            >
              <SentimentBadge sentiment={item.sentiment} />
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-snug truncate text-white">{item.title}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {item.source} &middot; {formatRelativeTime(item.publishedAt)}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-[var(--text-muted)] text-center py-4">No news available</p>
        )}
      </div>
    </div>
  );
}
