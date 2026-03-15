'use client';

import { MarketOverview } from '@/components/dashboard/market-overview';
import { MLStatus } from '@/components/dashboard/ml-status';
import { RegimeIndicator } from '@/components/dashboard/regime-indicator';
import { PredictionOverview } from '@/components/dashboard/prediction-overview';
import { SentimentOverview } from '@/components/dashboard/sentiment-overview';
import { TrendingTokens } from '@/components/dashboard/trending-tokens';
import { NewsFeed } from '@/components/dashboard/news-feed';
import { AgentSummary } from '@/components/dashboard/agent-summary';

export default function DashboardPage() {
  return (
    <div className="p-3 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 animate-fade-up">
        <i className="fa-solid fa-terminal text-xs text-[var(--primary)]" />
        <h2 className="text-base sm:text-lg font-bold">Mission Control</h2>
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
      </div>

      {/* Hero row: Market Stats + Regime */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <MarketOverview />
        <RegimeIndicator />
      </div>

      {/* Chronovisor row: Predictions + Sentiment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <PredictionOverview />
        <SentimentOverview />
      </div>

      {/* Trending tokens */}
      <TrendingTokens />

      {/* Bottom row: News + Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <NewsFeed />
        <AgentSummary />
      </div>

      {/* ML Sidecar — full width at bottom */}
      <MLStatus />
    </div>
  );
}
