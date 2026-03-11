import type { ChainAdapter } from '../../chains/types.js';

export interface RugIndicators {
  isHoneypot: boolean;
  hasLiquidityLock: boolean;
  ownerCanMint: boolean;
  ownerCanPause: boolean;
  hasBlacklist: boolean;
  highSellTax: boolean;
  riskScore: number;
  details: RugDetail[];
}

export interface RugDetail {
  check: string;
  passed: boolean;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export async function detectRugIndicators(
  tokenAddress: string,
  adapter: ChainAdapter,
): Promise<RugIndicators> {
  const details: RugDetail[] = [];

  // Check if contract has source code
  const code = await adapter.getContractCode(tokenAddress).catch(() => '');
  const hasCode = code.length > 2;

  details.push({
    check: 'Contract Verified',
    passed: hasCode,
    description: hasCode ? 'Contract source code is available' : 'Contract is not verified',
    severity: hasCode ? 'info' : 'warning',
  });

  // Check basic token info
  try {
    const info = await adapter.getTokenInfo(tokenAddress);
    const tokenValid = info.name.length > 0 && info.symbol.length > 0;
    details.push({
      check: 'Valid Token',
      passed: tokenValid,
      description: tokenValid
        ? `Token: ${info.name} (${info.symbol})`
        : 'Unable to read token metadata',
      severity: tokenValid ? 'info' : 'warning',
    });
  } catch {
    details.push({
      check: 'Valid Token',
      passed: false,
      description: 'Failed to read token contract',
      severity: 'critical',
    });
  }

  // Check owner functions (mint, pause, blacklist)
  const ownerChecks = await checkOwnerFunctions(tokenAddress, adapter);

  details.push({
    check: 'No Mint Function',
    passed: !ownerChecks.canMint,
    description: ownerChecks.canMint
      ? 'Owner can mint new tokens (inflation risk)'
      : 'No owner mint capability detected',
    severity: ownerChecks.canMint ? 'critical' : 'info',
  });

  details.push({
    check: 'No Pause Function',
    passed: !ownerChecks.canPause,
    description: ownerChecks.canPause
      ? 'Owner can pause transfers (honeypot risk)'
      : 'No pause capability detected',
    severity: ownerChecks.canPause ? 'warning' : 'info',
  });

  const riskScore = calculateRugRisk(details);

  return {
    isHoneypot: ownerChecks.canPause,
    hasLiquidityLock: false, // TODO: Check liquidity locks
    ownerCanMint: ownerChecks.canMint,
    ownerCanPause: ownerChecks.canPause,
    hasBlacklist: false, // TODO: Detect blacklist functions
    highSellTax: false, // TODO: Simulate sell to check tax
    riskScore,
    details,
  };
}

async function checkOwnerFunctions(
  _address: string,
  _adapter: ChainAdapter,
): Promise<{ canMint: boolean; canPause: boolean }> {
  // TODO: Use contract ABI analysis or bytecode scanning
  // to detect owner-only mint/pause/blacklist functions
  return { canMint: false, canPause: false };
}

function calculateRugRisk(details: RugDetail[]): number {
  let score = 0;
  for (const detail of details) {
    if (!detail.passed) {
      switch (detail.severity) {
        case 'critical':
          score += 30;
          break;
        case 'warning':
          score += 15;
          break;
        case 'info':
          score += 5;
          break;
      }
    }
  }
  return Math.min(100, score);
}
