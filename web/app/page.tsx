'use client';

import { FearGreedGauge } from '@/components/dashboard/fear-greed-gauge';
import { MarketOverview } from '@/components/dashboard/market-overview';
import { MLStatus } from '@/components/dashboard/ml-status';
import { RegimeIndicator } from '@/components/dashboard/regime-indicator';
import { TrendingTokens } from '@/components/dashboard/trending-tokens';
import { NewsFeed } from '@/components/dashboard/news-feed';
import { AgentSummary } from '@/components/dashboard/agent-summary';

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-lg font-bold">Mission Control</h2>
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
      </div>

      {/* Top row: 4-column */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <FearGreedGauge />
        <MarketOverview />
        <RegimeIndicator />
        <MLStatus />
      </div>

      {/* Middle: full-width trending */}
      <div className="mb-4">
        <TrendingTokens />
      </div>

      {/* Bottom: 2-column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NewsFeed />
        <AgentSummary />
      </div>
    </div>
  );
}
