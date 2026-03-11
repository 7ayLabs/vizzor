import type { ChainAdapter, TokenInfo } from '../../chains/types.js';

export interface ProjectAnalysis {
  token: TokenInfo | null;
  contractVerified: boolean;
  hasSourceCode: boolean;
  holderConcentration: number;
  topHolders: { address: string; percentage: number }[];
  riskIndicators: RiskIndicator[];
  riskScore: number;
}

export interface RiskIndicator {
  name: string;
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  points: number;
  description: string;
}

export async function analyzeProject(
  address: string,
  adapter: ChainAdapter,
): Promise<ProjectAnalysis> {
  const [token, code, holders] = await Promise.allSettled([
    adapter.getTokenInfo(address),
    adapter.getContractCode(address),
    adapter.getTopHolders(address, 10),
  ]);

  const tokenInfo = token.status === 'fulfilled' ? token.value : null;
  const contractCode = code.status === 'fulfilled' ? code.value : '';
  const topHolders = holders.status === 'fulfilled' ? holders.value : [];

  const hasSourceCode = contractCode.length > 2;
  const riskIndicators = evaluateRiskIndicators(tokenInfo, hasSourceCode, topHolders);
  const riskScore = riskIndicators.reduce(
    (score, indicator) => score + (indicator.detected ? indicator.points : 0),
    0,
  );

  const totalSupply = tokenInfo?.totalSupply ?? 0n;
  const topHolderPercentage =
    topHolders.length > 0 && totalSupply > 0n
      ? Number(((topHolders[0]?.balance ?? 0n) * 10000n) / totalSupply) / 100
      : 0;

  return {
    token: tokenInfo,
    contractVerified: hasSourceCode,
    hasSourceCode,
    holderConcentration: topHolderPercentage,
    topHolders: topHolders.map((h) => ({
      address: h.address,
      percentage: totalSupply > 0n ? Number((h.balance * 10000n) / totalSupply) / 100 : 0,
    })),
    riskIndicators,
    riskScore: Math.min(100, riskScore),
  };
}

function evaluateRiskIndicators(
  token: TokenInfo | null,
  hasSource: boolean,
  topHolders: { address: string; balance: bigint }[],
): RiskIndicator[] {
  const indicators: RiskIndicator[] = [];

  indicators.push({
    name: 'Unverified Contract',
    detected: !hasSource,
    severity: 'high',
    points: 30,
    description: 'Contract source code is not verified on block explorer',
  });

  if (token && topHolders.length > 0) {
    const topBalance = topHolders[0]?.balance ?? 0n;
    const concentrated = token.totalSupply > 0n && topBalance * 2n > token.totalSupply;
    indicators.push({
      name: 'Concentrated Supply',
      detected: concentrated,
      severity: 'critical',
      points: 25,
      description: 'Top holder owns more than 50% of total supply',
    });
  }

  indicators.push({
    name: 'No Token Info',
    detected: token === null,
    severity: 'medium',
    points: 15,
    description: 'Unable to read token metadata from contract',
  });

  return indicators;
}
