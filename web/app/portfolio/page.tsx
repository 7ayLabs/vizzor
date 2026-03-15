'use client';

import { useState } from 'react';
import { PositionsTable } from '@/components/portfolio/positions-table';
import { TradeHistory } from '@/components/portfolio/trade-history';
import { PerformanceMetrics } from '@/components/portfolio/performance-metrics';

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState<'positions' | 'trades'>('positions');

  return (
    <div className="p-3 sm:p-5">
      <div className="flex items-center gap-2 mb-4 sm:mb-5">
        <h2 className="text-base sm:text-lg font-bold">Portfolio</h2>
      </div>

      <div className="space-y-4">
        <PerformanceMetrics />

        {/* Tabs */}
        <div className="flex gap-0 border-b border-[var(--border)]">
          <button
            onClick={() => setActiveTab('positions')}
            className={`px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-medium border-b-2 transition-colors touch-target ${
              activeTab === 'positions'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Positions
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-medium border-b-2 transition-colors touch-target ${
              activeTab === 'trades'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
          >
            Trade History
          </button>
        </div>

        {activeTab === 'positions' ? <PositionsTable /> : <TradeHistory />}
      </div>
    </div>
  );
}
