'use client';

import { useApi } from '@/hooks/use-api';
import type { FearGreedData, NewsItem, SentimentResult } from '@/lib/types';

const FG_ZONES = [
  { max: 20, label: 'Extreme Fear', color: '#ef4444' },
  { max: 40, label: 'Fear', color: '#a1a1a1' },
  { max: 60, label: 'Neutral', color: '#6b6b6b' },
  { max: 80, label: 'Greed', color: '#a1a1a1' },
  { max: 100, label: 'Extreme Greed', color: '#22c55e' },
];

function getFGStyle(value: number) {
  for (const z of FG_ZONES) if (value <= z.max) return z;
  return FG_ZONES[4];
}

export function SentimentOverview() {
  const { data: fg } = useApi<FearGreedData>('/v1/market/fear-greed');
  const { data: newsData } = useApi<{ news: NewsItem[] }>('/v1/market/news');
  const { data: mlSentiment } = useApi<SentimentResult>('/v1/ml/sentiment');

  const fgValue = fg?.current?.value ?? 50;
  const fgStyle = getFGStyle(fgValue);

  const news = newsData?.news ?? [];
  const hasNews = news.length > 0;

  const bullish = news.filter(
    (n) => n.sentiment === 'bullish' || n.sentiment === 'positive',
  ).length;
  const bearish = news.filter(
    (n) => n.sentiment === 'bearish' || n.sentiment === 'negative',
  ).length;
  const neutral = news.filter((n) => n.sentiment === 'neutral').length;
  const total = news.length || 1;

  // Derive mood from news when available, otherwise use Fear & Greed
  const mood = hasNews
    ? bullish > bearish
      ? 'Bullish'
      : bearish > bullish
        ? 'Bearish'
        : 'Neutral'
    : fgValue >= 60
      ? 'Bullish'
      : fgValue <= 40
        ? 'Bearish'
        : 'Neutral';
  const moodColor = hasNews
    ? bullish > bearish
      ? 'var(--success)'
      : bearish > bullish
        ? 'var(--danger)'
        : '#a1a1a1'
    : fgValue >= 60
      ? 'var(--success)'
      : fgValue <= 40
        ? 'var(--danger)'
        : '#a1a1a1';
  const moodIcon = hasNews
    ? bullish > bearish
      ? 'fa-solid fa-face-smile'
      : bearish > bullish
        ? 'fa-solid fa-face-frown'
        : 'fa-solid fa-face-meh'
    : fgValue >= 60
      ? 'fa-solid fa-face-smile'
      : fgValue <= 40
        ? 'fa-solid fa-face-frown'
        : 'fa-solid fa-face-meh';

  // ML sentiment styling
  const mlColor =
    mlSentiment?.sentiment === 'bullish'
      ? 'var(--success)'
      : mlSentiment?.sentiment === 'bearish'
        ? 'var(--danger)'
        : '#a1a1a1';

  return (
    <div className="dash-card bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-xl animate-fade-up stagger-5">
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-brain text-xs text-white/45" />
        <h3 className="dash-title">{hasNews ? 'Sentiment Intelligence' : 'Market Pulse'}</h3>
      </div>

      {/* Overall mood */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-white/[0.06]">
          <i className={`${moodIcon} text-base`} style={{ color: moodColor }} />
        </div>
        <div>
          <p className="text-lg font-bold" style={{ color: moodColor }}>
            {mood}
          </p>
          <p className="text-[10px] text-[#6b6b6b]">
            {hasNews ? 'Overall market sentiment' : 'Based on Fear & Greed Index'}
          </p>
        </div>
      </div>

      {/* Fear & Greed bar */}
      <div className="mb-3 pb-3 border-b border-white/[0.08]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[#6b6b6b] flex items-center gap-1">
            <i className="fa-solid fa-gauge text-[8px]" />
            Fear & Greed Index
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-mono font-bold" style={{ color: fgStyle.color }}>
              {fg ? fgValue : '---'}
            </span>
            <span className="text-xs" style={{ color: fgStyle.color }}>
              {fg ? fgStyle.label : ''}
            </span>
          </div>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-bar-fill"
            style={{ width: `${fgValue}%`, background: fgStyle.color }}
          />
        </div>
      </div>

      {/* ML Sentiment badge (if available) */}
      {mlSentiment && mlSentiment.sentiment && (
        <div className="mb-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#6b6b6b] flex items-center gap-1">
              <i className="fa-solid fa-microchip text-[8px]" />
              ML Sentiment
            </span>
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-bold capitalize px-2 py-0.5 rounded"
                style={{
                  color: mlColor,
                  background:
                    mlSentiment.sentiment === 'bullish'
                      ? 'var(--success-bg)'
                      : mlSentiment.sentiment === 'bearish'
                        ? 'var(--danger-bg)'
                        : 'rgba(107, 107, 107, 0.15)',
                }}
              >
                {mlSentiment.sentiment}
              </span>
              <span className="text-sm font-mono font-bold text-white/70">
                {mlSentiment.confidence.toFixed(0)}%
              </span>
            </div>
          </div>
          {mlSentiment.key_topics && mlSentiment.key_topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {mlSentiment.key_topics.slice(0, 5).map((topic, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-[var(--text-muted)]"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* News sentiment distribution — only when articles are available */}
      {hasNews && (
        <div>
          <p className="text-xs text-[#6b6b6b] mb-2 flex items-center gap-1">
            <i className="fa-solid fa-newspaper text-[8px]" />
            News Sentiment ({news.length} articles)
          </p>
          <div className="flex gap-4 text-sm mb-2">
            <div className="flex items-center gap-1">
              <i className="fa-solid fa-arrow-up text-[9px] text-[var(--success)]" />
              <span className="font-mono font-bold text-[var(--success)]">{bullish}</span>
            </div>
            <div className="flex items-center gap-1">
              <i className="fa-solid fa-arrow-down text-[9px] text-[var(--danger)]" />
              <span className="font-mono font-bold text-[var(--danger)]">{bearish}</span>
            </div>
            <div className="flex items-center gap-1">
              <i className="fa-solid fa-minus text-[9px] text-[#6b6b6b]" />
              <span className="font-mono font-bold text-white">{neutral}</span>
            </div>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
            {bullish > 0 && (
              <div
                className="bg-[var(--success)] animate-bar-fill"
                style={{ width: `${(bullish / total) * 100}%` }}
              />
            )}
            {neutral > 0 && (
              <div className="bg-[#6b6b6b]" style={{ width: `${(neutral / total) * 100}%` }} />
            )}
            {bearish > 0 && (
              <div
                className="bg-[var(--danger)]"
                style={{ width: `${(bearish / total) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
