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
      className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase shrink-0"
      style={{ background: bg, color }}
    >
      {sentiment}
    </span>
  );
}

export function NewsFeed() {
  const { data, error, isLoading } = useApi<{ news: NewsItem[] }>('/v1/market/news', {
    refreshInterval: 120000,
  });
  const items = data?.news ?? [];

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl animate-fade-up stagger-4">
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-newspaper text-xs text-white/50" />
        <h3 className="dash-title">Latest News</h3>
        {items.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--text-muted)] font-mono">
            {items.length}
          </span>
        )}
      </div>

      <div
        className="overflow-y-auto space-y-1"
        style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '200px' }}
      >
        {isLoading && !data ? (
          /* Loading skeleton */
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-2 py-2">
                <div className="w-14 h-4 rounded bg-white/[0.06] animate-shimmer shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3.5 w-full bg-white/[0.06] rounded animate-shimmer" />
                  <div className="h-2.5 w-1/3 bg-white/[0.06] rounded animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">News feed unavailable</p>
        ) : items.length > 0 ? (
          items.map((item, i) => (
            <a
              key={i}
              href={item.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 py-2 px-1.5 rounded-lg border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition-colors cursor-pointer group"
            >
              <SentimentBadge sentiment={item.sentiment} />
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug text-white group-hover:text-[var(--primary)] transition-colors line-clamp-2">
                  {item.title}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {item.source} &middot; {formatRelativeTime(item.publishedAt)}
                </p>
              </div>
            </a>
          ))
        ) : (
          <div className="text-center py-6">
            <i className="fa-solid fa-newspaper text-2xl text-white/10 mb-3 block" />
            <p className="text-sm text-[var(--text-secondary)] mb-1">No news available</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-xs mx-auto">
              News sources are currently unreachable. Data refreshes automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
