import type { ChainAdapter } from '../../chains/types.js';

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

  const whaleConcentration = whales.reduce((sum, w) => sum + w.percentageOfSupply, 0);

  const risk: WhaleReport['risk'] =
    whaleConcentration > 70 ? 'high' : whaleConcentration > 40 ? 'medium' : 'low';

  return {
    tokenAddress,
    chain: adapter.chainId,
    whales,
    whaleConcentration,
    risk,
  };
}
