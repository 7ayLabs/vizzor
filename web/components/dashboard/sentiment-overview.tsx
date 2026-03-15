'use client';

import { useApi } from '@/hooks/use-api';
import type { FearGreedData, NewsItem } from '@/lib/types';

const FG_ZONES = [
  { max: 20, label: 'Extreme Fear', color: '#ef4444' },
  { max: 40, label: 'Fear', color: '#f97316' },
  { max: 60, label: 'Neutral', color: '#f59e0b' },
  { max: 80, label: 'Greed', color: '#84cc16' },
  { max: 100, label: 'Extreme Greed', color: '#10b981' },
];

function getFGStyle(value: number) {
  for (const z of FG_ZONES) if (value <= z.max) return z;
  return FG_ZONES[4];
}

export function SentimentOverview() {
  const { data: fg } = useApi<FearGreedData>('/v1/market/fear-greed');
  const { data: newsData } = useApi<{ news: NewsItem[] }>('/v1/market/news');

  const fgValue = fg?.current?.value ?? 50;
  const fgStyle = getFGStyle(fgValue);

  const news = newsData?.news ?? [];
  const bullish = news.filter(
    (n) => n.sentiment === 'bullish' || n.sentiment === 'positive',
  ).length;
  const bearish = news.filter(
    (n) => n.sentiment === 'bearish' || n.sentiment === 'negative',
  ).length;
  const neutral = news.filter((n) => n.sentiment === 'neutral').length;
  const total = news.length || 1;

  const mood = bullish > bearish ? 'Bullish' : bearish > bullish ? 'Bearish' : 'Neutral';
  const moodColor =
    bullish > bearish ? 'var(--success)' : bearish > bullish ? 'var(--danger)' : 'var(--muted)';
  const moodIcon =
    bullish > bearish
      ? 'fa-solid fa-face-smile'
      : bearish > bullish
        ? 'fa-solid fa-face-frown'
        : 'fa-solid fa-face-meh';

  return (
    <div className="dash-card bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 sm:p-4 animate-fade-up stagger-5">
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-brain text-xs text-[var(--accent-purple)]" />
        <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
          Sentiment Intelligence
        </h3>
      </div>

      {/* Overall mood */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="flex size-10 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${moodColor} 15%, transparent)`,
          }}
        >
          <i className={`${moodIcon} text-base`} style={{ color: moodColor }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: moodColor }}>
            {mood}
          </p>
          <p className="text-[10px] text-[var(--muted)]">Overall market sentiment</p>
        </div>
      </div>

      {/* Fear & Greed bar */}
      <div className="mb-3 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--muted)] flex items-center gap-1">
            <i className="fa-solid fa-gauge text-[8px]" />
            Fear & Greed Index
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold" style={{ color: fgStyle.color }}>
              {fg ? fgValue : '---'}
            </span>
            <span className="text-[10px]" style={{ color: fgStyle.color }}>
              {fg ? fgStyle.label : ''}
            </span>
          </div>
        </div>
        <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-bar-fill"
            style={{ width: `${fgValue}%`, background: fgStyle.color }}
          />
        </div>
      </div>

      {/* News sentiment distribution */}
      <div>
        <p className="text-[10px] text-[var(--muted)] mb-2 flex items-center gap-1">
          <i className="fa-solid fa-newspaper text-[8px]" />
          News Sentiment ({news.length} articles)
        </p>
        <div className="flex gap-4 text-xs mb-2">
          <div className="flex items-center gap-1">
            <i className="fa-solid fa-arrow-up text-[8px] text-[var(--success)]" />
            <span className="font-mono font-bold text-[var(--success)]">{bullish}</span>
          </div>
          <div className="flex items-center gap-1">
            <i className="fa-solid fa-arrow-down text-[8px] text-[var(--danger)]" />
            <span className="font-mono font-bold text-[var(--danger)]">{bearish}</span>
          </div>
          <div className="flex items-center gap-1">
            <i className="fa-solid fa-minus text-[8px] text-[var(--muted)]" />
            <span className="font-mono font-bold">{neutral}</span>
          </div>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-[var(--background)]">
          {bullish > 0 && (
            <div
              className="bg-[var(--success)] animate-bar-fill"
              style={{ width: `${(bullish / total) * 100}%` }}
            />
          )}
          {neutral > 0 && (
            <div className="bg-[var(--muted)]" style={{ width: `${(neutral / total) * 100}%` }} />
          )}
          {bearish > 0 && (
            <div className="bg-[var(--danger)]" style={{ width: `${(bearish / total) * 100}%` }} />
          )}
        </div>
      </div>
    </div>
  );
}
