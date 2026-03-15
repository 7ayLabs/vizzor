'use client';

import { sentimentColor, formatRelativeTime } from '@/lib/utils';

interface NewsItemData {
  title: string;
  source?: string;
  sentiment?: string;
  publishedAt?: string;
  url?: string;
  confidence?: number;
}

export function NewsCard({ result }: { result: unknown }) {
  // Handle { news: [...] }, { headlines: [...] }, or direct array
  const raw = result as Record<string, unknown>;
  const items: NewsItemData[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.news)
      ? (raw.news as NewsItemData[])
      : Array.isArray(raw?.headlines)
        ? (raw.headlines as NewsItemData[])
        : [];

  // Handle sentiment analysis result
  if (!items.length && raw?.sentiment) {
    const sentiment = String(raw.sentiment);
    const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0;
    const color = sentimentColor(sentiment);
    return (
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold">Sentiment Analysis</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full uppercase"
            style={{ color: `var(${color})`, background: `var(${color})15` }}
          >
            {sentiment}
          </span>
        </div>
        <div className="text-[10px] text-[var(--muted)]">
          Confidence: {Math.round(confidence * 100)}%
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <div className="p-3">
      <div className="text-xs font-bold mb-2">News</div>
      <div className="space-y-2">
        {items.slice(0, 5).map((item, i) => {
          const color = item.sentiment ? sentimentColor(item.sentiment) : '--muted';
          return (
            <div key={i} className="flex items-start gap-2">
              {item.sentiment && (
                <span
                  className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: `var(${color})` }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--foreground)] leading-tight line-clamp-2">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener"
                      className="hover:text-[var(--primary)]"
                    >
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--muted)]">
                  {item.source && <span>{item.source}</span>}
                  {item.publishedAt && <span>{formatRelativeTime(item.publishedAt)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
