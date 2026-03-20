'use client';

import { PredictionOverview } from '@/components/dashboard/prediction-overview';
import { NewsFeed } from '@/components/dashboard/news-feed';
import { PredictionAccuracyPanel } from '@/components/dashboard/prediction-accuracy';

export default function DashboardPage() {
  return (
    <div className="p-3 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 animate-fade-up">
        <i className="fa-solid fa-terminal text-xs text-[var(--primary)]" />
        <h2 className="text-base sm:text-lg font-bold">Mission Control</h2>
        <span className="inline-block w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
      </div>

      {/* HERO: Chronovisor Predictions — full width */}
      <PredictionOverview />

      {/* Row 2: Prediction Accuracy + Latest News */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <PredictionAccuracyPanel />
        <NewsFeed />
      </div>
    </div>
  );
}
