import type { ChainAdapter } from '../../chains/types.js';
import { getMLClient } from '../../ml/client.js';
import type { AnomalyResult, WalletMLFeatures } from '../../ml/types.js';

export interface WhaleActivity {
  address: string;
  balance: bigint;
  percentageOfSupply: number;
  recentActivity: 'accumulating' | 'distributing' | 'holding' | 'unknown';
}

export interface WhaleReport {
  tokenAddress: string;
  chain: string;
  whales: WhaleActivity[];
  whaleConcentration: number;
  risk: 'low' | 'medium' | 'high';
  anomalies?: AnomalyResult[];
}

export async function trackWhales(
  tokenAddress: string,
  adapter: ChainAdapter,
): Promise<WhaleReport> {
  const [tokenInfo, holders] = await Promise.allSettled([
    adapter.getTokenInfo(tokenAddress),
    adapter.getTopHolders(tokenAddress, 20),
  ]);

  const totalSupply = tokenInfo.status === 'fulfilled' ? tokenInfo.value.totalSupply : 0n;
  const topHolders = holders.status === 'fulfilled' ? holders.value : [];

  const whales: WhaleActivity[] = topHolders.map((h) => ({
    address: h.address,
    balance: h.balance,
    percentageOfSupply: totalSupply > 0n ? Number((h.balance * 10000n) / totalSupply) / 100 : 0,
    recentActivity: 'unknown' as const,
  }));

  // ML: classify top 10 whales using wallet classifier
  const mlClient = getMLClient();
  if (mlClient) {
    const classifyTasks = whales.slice(0, 10).map(async (whale, idx) => {
      try {
        const features: WalletMLFeatures = {
          tx_count: 0,
          avg_value_eth: Number(whale.balance) / 1e18,
          max_value_eth: Number(whale.balance) / 1e18,
          avg_gas_used: 0,
          unique_recipients: 0,
          unique_methods: 0,
          time_span_hours: 0,
          avg_interval_seconds: 3600,
          min_interval_seconds: 60,
          contract_interaction_pct: 0,
          self_transfer_pct: 0,
          high_value_tx_pct: whale.percentageOfSupply > 5 ? 0.5 : 0.1,
          failed_tx_pct: 0,
          token_diversity: 1,
        };
        const result = await mlClient.classifyWallet(features);
        if (result) {
          const behavior = result.behavior_type;
          if (behavior === 'whale' || behavior === 'normal_trader') {
            whales[idx]!.recentActivity = 'holding';
          } else if (behavior === 'sniper' || behavior === 'bot') {
            whales[idx]!.recentActivity = 'accumulating';
          } else if (behavior === 'mixer_user' || behavior === 'rug_deployer') {
            whales[idx]!.recentActivity = 'distributing';
          }
        }
      } catch {
        // Keep 'unknown' on failure
      }
    });
    await Promise.allSettled(classifyTasks);
  }

  // ML: detect anomalies in whale transfer flows
  let detectedAnomalies: AnomalyResult[] | undefined;
  if (mlClient && whales.length > 0) {
    try {
      const flows = whales.map((w) => ({
        symbol: tokenAddress,
        amount: Number(w.balance) / 1e18,
        from: w.address,
        to: tokenAddress,
        timestamp: Date.now(),
        type: 'transfer' as const,
      }));
      const anomalyResults = await mlClient.detectAnomalies(flows);
      if (anomalyResults.length > 0) {
        detectedAnomalies = anomalyResults.filter((r) => r.isAnomaly);
      }
    } catch {
      // ML anomaly detection unavailable
    }
  }

  const whaleConcentration = whales.reduce((sum, w) => sum + w.percentageOfSupply, 0);

  const risk: WhaleReport['risk'] =
    whaleConcentration > 70 ? 'high' : whaleConcentration > 40 ? 'medium' : 'low';

  return {
    tokenAddress,
    chain: adapter.chainId,
    whales,
    whaleConcentration,
    risk,
    ...(detectedAnomalies && detectedAnomalies.length > 0 && { anomalies: detectedAnomalies }),
  };
}
