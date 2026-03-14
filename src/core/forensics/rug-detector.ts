import type { ChainAdapter } from '../../chains/types.js';
import {
  hasMintFunction,
  hasPauseFunction,
  hasBlacklistFunction,
  scanBytecode,
} from './bytecode-scanner.js';
import { getMLClient, initMLClient } from '../../ml/client.js';
import { getConfig } from '../../config/loader.js';
import type { RugMLResult } from '../../ml/types.js';

export interface RugIndicators {
  isHoneypot: boolean;
  hasLiquidityLock: boolean;
  ownerCanMint: boolean;
  ownerCanPause: boolean;
  hasBlacklist: boolean;
  highSellTax: boolean;
  riskScore: number;
  details: RugDetail[];
  mlAnalysis?: RugMLResult;
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

  // Get contract bytecode for analysis
  const code = await adapter.getContractCode(tokenAddress).catch(() => '');
  const hasCode = code.length > 2;

  details.push({
    check: 'Contract Verified',
    passed: hasCode,
    description: hasCode ? 'Contract bytecode is available' : 'No contract code found',
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

  // Bytecode scanning for dangerous functions
  const canMint = hasCode && hasMintFunction(code);
  const canPause = hasCode && hasPauseFunction(code);
  const hasBlacklist_ = hasCode && hasBlacklistFunction(code);

  details.push({
    check: 'No Mint Function',
    passed: !canMint,
    description: canMint
      ? 'Owner can mint new tokens (inflation risk)'
      : 'No owner mint capability detected',
    severity: canMint ? 'critical' : 'info',
  });

  details.push({
    check: 'No Pause Function',
    passed: !canPause,
    description: canPause
      ? 'Owner can pause transfers (honeypot risk)'
      : 'No pause capability detected',
    severity: canPause ? 'warning' : 'info',
  });

  details.push({
    check: 'No Blacklist Function',
    passed: !hasBlacklist_,
    description: hasBlacklist_
      ? 'Owner can blacklist addresses (honeypot risk)'
      : 'No blacklist capability detected',
    severity: hasBlacklist_ ? 'critical' : 'info',
  });

  // Add all bytecode findings as details
  if (hasCode) {
    const findings = scanBytecode(code);
    for (const finding of findings) {
      // Skip duplicates we already added above
      if (
        finding.name.includes('mint') ||
        finding.name.includes('pause') ||
        finding.name.includes('blacklist') ||
        finding.name.includes('Blacklist')
      ) {
        continue;
      }

      if (finding.severity !== 'info') {
        details.push({
          check: finding.name,
          passed: false,
          description: finding.description,
          severity: finding.severity,
        });
      }
    }
  }

  const riskScore = calculateRugRisk(details);

  // ML enhancement — call rug detector model if available
  let mlAnalysis: RugMLResult | undefined;
  try {
    let mlClient = getMLClient();
    if (!mlClient) {
      try {
        const cfg = getConfig();
        if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
          mlClient = initMLClient(cfg.ml.sidecarUrl);
        }
      } catch {
        /* config not loaded */
      }
    }
    if (mlClient) {
      const mlResult = await mlClient.predictRug({
        bytecode_size: hasCode ? code.length : 0,
        is_verified: hasCode ? 1 : 0,
        holder_concentration: 0,
        has_proxy: 0,
        has_mint: canMint ? 1 : 0,
        has_pause: canPause ? 1 : 0,
        has_blacklist: hasBlacklist_ ? 1 : 0,
        liquidity_locked: 0,
        buy_tax: 0,
        sell_tax: 0,
        contract_age_days: 0,
        total_transfers: 0,
        owner_balance_pct: 0,
        is_open_source: hasCode ? 1 : 0,
        top10_holder_pct: 0,
      });
      if (mlResult) {
        mlAnalysis = mlResult;
      }
    }
  } catch {
    /* ML unavailable — continue with rule-based */
  }

  return {
    isHoneypot: canPause || hasBlacklist_,
    hasLiquidityLock: false,
    ownerCanMint: canMint,
    ownerCanPause: canPause,
    hasBlacklist: hasBlacklist_,
    highSellTax: false,
    riskScore: mlAnalysis
      ? Math.round(riskScore * 0.4 + mlAnalysis.rug_probability * 100 * 0.6)
      : riskScore,
    details,
    mlAnalysis,
  };
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
