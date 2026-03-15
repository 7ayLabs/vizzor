'use client';

import { TokenScanner } from '@/components/onchain/token-scanner';
import { RugDetector } from '@/components/onchain/rug-detector';
import { WalletAnalyzer } from '@/components/onchain/wallet-analyzer';

export default function OnChainPage() {
  return (
    <div className="p-3 sm:p-5">
      <div className="flex items-center gap-2 mb-4 sm:mb-5">
        <h2 className="text-base sm:text-lg font-bold">On-Chain Intelligence</h2>
      </div>

      <div className="space-y-4">
        {/* Full-width token scanner */}
        <TokenScanner />

        {/* 2-col bottom */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RugDetector />
          <WalletAnalyzer />
        </div>
      </div>
    </div>
  );
}
