'use client';

import { useState } from 'react';
import type { ToolCallResult } from '@/lib/types';
import { MarketDataCard } from './cards/market-data-card';
import { SecurityCard } from './cards/security-card';
import { PredictionCard } from './cards/prediction-card';
import { TrendingCard } from './cards/trending-card';
import { NewsCard } from './cards/news-card';
import { GenericCard } from './cards/generic-card';

/** TUI-style tool labels — matches src/tui/components/tool-status.tsx */
const TOOL_LABELS: Record<string, { active: string; done: string }> = {
  get_token_info: { active: 'Fetching token info', done: 'Token info loaded' },
  analyze_wallet: { active: 'Analyzing wallet', done: 'Wallet analyzed' },
  check_rug_indicators: { active: 'Checking rug indicators', done: 'Rug check complete' },
  get_market_data: { active: 'Fetching market data', done: 'Market data loaded' },
  search_upcoming_icos: { active: 'Searching ICOs', done: 'ICO search complete' },
  search_token_dex: { active: 'Searching DEX pairs', done: 'DEX search complete' },
  get_trending: { active: 'Fetching trending tokens', done: 'Trending loaded' },
  get_crypto_news: { active: 'Fetching crypto news', done: 'News loaded' },
  get_raises: { active: 'Fetching recent raises', done: 'Raises loaded' },
  get_token_security: { active: 'Running security check', done: 'Security check complete' },
  get_prediction: { active: 'Generating prediction', done: 'Prediction ready' },
  get_ml_prediction: { active: 'Running ML prediction', done: 'ML prediction ready' },
  get_technical_analysis: { active: 'Running technical analysis', done: 'Analysis complete' },
  get_ta_ml_analysis: { active: 'Running ML analysis', done: 'ML analysis complete' },
  get_fear_greed: { active: 'Fetching fear & greed', done: 'Fear & greed loaded' },
  get_derivatives_data: { active: 'Fetching derivatives data', done: 'Derivatives loaded' },
  analyze_news_sentiment: { active: 'Analyzing sentiment', done: 'Sentiment analyzed' },
};

const CARD_MAP: Record<string, React.ComponentType<{ result: unknown }>> = {
  get_market_data: MarketDataCard,
  search_token_dex: MarketDataCard,
  get_token_security: SecurityCard,
  check_rug_indicators: SecurityCard,
  get_prediction: PredictionCard,
  get_ml_prediction: PredictionCard,
  get_technical_analysis: PredictionCard,
  get_ta_ml_analysis: PredictionCard,
  get_trending: TrendingCard,
  get_crypto_news: NewsCard,
  analyze_news_sentiment: NewsCard,
};

function StatusIndicator({ status }: { status: ToolCallResult['status'] }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[var(--primary)]">
        <span className="inline-flex gap-0.5">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-[var(--danger)]">
        <i className="fa-solid fa-xmark" />
        <span className="hidden sm:inline">Error</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-[var(--success)]">
      <i className="fa-solid fa-check" />
      <span className="hidden sm:inline">Done</span>
    </span>
  );
}

export function ToolResultCard({ toolCall }: { toolCall: ToolCallResult }) {
  const [open, setOpen] = useState(true);
  const Card = CARD_MAP[toolCall.tool];
  const labels = TOOL_LABELS[toolCall.tool];
  const displayName =
    toolCall.status === 'pending'
      ? (labels?.active ?? `Running ${toolCall.tool}`)
      : (labels?.done ??
        toolCall.tool
          .replace(/^(get_|check_|analyze_|search_|run_|create_|list_|classify_)/, '')
          .replace(/_/g, ' '));

  return (
    <div className="w-full rounded-lg border border-[var(--border)] overflow-hidden tool-status-enter">
      {/* Header — TUI-inspired with status */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs bg-[var(--card)] hover:bg-[var(--card-hover)] active:bg-[var(--border)] transition-colors touch-target"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <StatusIndicator status={toolCall.status} />
          <span className="text-[var(--foreground)] font-medium capitalize truncate text-[11px] sm:text-xs">
            {displayName}
          </span>
        </div>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {/* Content — animated expand */}
      {open && toolCall.status !== 'pending' && (
        <div className="border-t border-[var(--border)] animate-card-expand">
          {Card ? (
            <Card result={toolCall.result} />
          ) : (
            <GenericCard tool={toolCall.tool} result={toolCall.result} />
          )}
        </div>
      )}
    </div>
  );
}
