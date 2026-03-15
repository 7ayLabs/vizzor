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
import { checkTokenSecurity } from '../../data/sources/goplus.js';
import type { TokenSecurity } from '../../data/sources/goplus.js';
import { SmartMoneyTracker } from '../scanner/smart-money.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('rug-detector');

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

// ---------------------------------------------------------------------------
// Pre-Trade Safety Gate — comprehensive multi-layer safety check
// ---------------------------------------------------------------------------

export interface PreTradeSafetyResult {
  safe: boolean;
  checks: {
    onChainSecurity: { passed: boolean; details: string };
    mlRugDetection: { passed: boolean; rugProbability: number; details: string };
    honeypotSimulation: { passed: boolean; details: string };
    creatorReputation: { passed: boolean; score: number; details: string };
  };
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  blockReason?: string;
}

/**
 * Run a comprehensive pre-trade safety gate combining on-chain checks,
 * ML rug detection, honeypot simulation, and creator reputation analysis.
 *
 * Returns a PreTradeSafetyResult with individual check results and an
 * overall risk assessment. If ANY critical check fails, the trade is blocked.
 */
export async function runPreTradeSafetyGate(
  address: string,
  chain: string,
): Promise<PreTradeSafetyResult> {
  const checks: PreTradeSafetyResult['checks'] = {
    onChainSecurity: { passed: true, details: 'Not checked' },
    mlRugDetection: { passed: true, rugProbability: 0, details: 'Not checked' },
    honeypotSimulation: { passed: true, details: 'Not checked' },
    creatorReputation: { passed: true, score: 50, details: 'Not checked' },
  };

  let criticalFailures = 0;
  let mediumFailures = 0;
  let blockReason: string | undefined;

  // -----------------------------------------------------------------------
  // 1. On-chain security check via GoPlus
  // -----------------------------------------------------------------------
  let tokenSecurity: TokenSecurity | null = null;
  try {
    tokenSecurity = await checkTokenSecurity(address, chain);

    if (tokenSecurity) {
      const issues: string[] = [];

      if (tokenSecurity.isHoneypot) issues.push('honeypot detected');
      if (tokenSecurity.isMintable) issues.push('mintable');
      if (tokenSecurity.hiddenOwner) issues.push('hidden owner');
      if (tokenSecurity.selfDestruct) issues.push('self-destruct');
      if (tokenSecurity.canTakeBackOwnership) issues.push('ownership takeback');
      if (tokenSecurity.isBlacklisted) issues.push('blacklisted');
      if (tokenSecurity.cannotBuy) issues.push('cannot buy');
      if (tokenSecurity.cannotSellAll) issues.push('cannot sell all');

      if (tokenSecurity.riskLevel === 'danger') {
        checks.onChainSecurity = {
          passed: false,
          details: `GoPlus: DANGER — ${issues.join(', ') || 'high risk indicators'}`,
        };
        criticalFailures++;
        blockReason = blockReason ?? `On-chain security: ${issues.join(', ')}`;
      } else if (tokenSecurity.riskLevel === 'warning') {
        checks.onChainSecurity = {
          passed: false,
          details: `GoPlus: WARNING — ${issues.join(', ') || 'moderate risk indicators'}`,
        };
        mediumFailures++;
      } else {
        checks.onChainSecurity = {
          passed: true,
          details: `GoPlus: Safe (sell tax: ${(tokenSecurity.sellTax * 100).toFixed(1)}%, buy tax: ${(tokenSecurity.buyTax * 100).toFixed(1)}%)`,
        };
      }
    } else {
      checks.onChainSecurity = {
        passed: true,
        details: 'GoPlus: No data available for this token/chain',
      };
    }
  } catch (err) {
    log.debug(`GoPlus check failed: ${err instanceof Error ? err.message : String(err)}`);
    checks.onChainSecurity = {
      passed: true,
      details: 'GoPlus: Check unavailable (API error)',
    };
  }

  // -----------------------------------------------------------------------
  // 2. ML rug detection
  // -----------------------------------------------------------------------
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
        bytecode_size: 0,
        is_verified: tokenSecurity?.isOpenSource ? 1 : 0,
        holder_concentration: 0,
        has_proxy: tokenSecurity?.isProxy ? 1 : 0,
        has_mint: tokenSecurity?.isMintable ? 1 : 0,
        has_pause: 0,
        has_blacklist: tokenSecurity?.isBlacklisted ? 1 : 0,
        liquidity_locked: 0,
        buy_tax: tokenSecurity?.buyTax ?? 0,
        sell_tax: tokenSecurity?.sellTax ?? 0,
        contract_age_days: 0,
        total_transfers: 0,
        owner_balance_pct: tokenSecurity?.ownerPercent ?? 0,
        is_open_source: tokenSecurity?.isOpenSource ? 1 : 0,
        top10_holder_pct: 0,
      });

      if (mlResult) {
        const rugProb = mlResult.rug_probability;
        if (rugProb > 0.8) {
          checks.mlRugDetection = {
            passed: false,
            rugProbability: rugProb,
            details: `ML model: ${(rugProb * 100).toFixed(1)}% rug probability (${mlResult.risk_level})`,
          };
          criticalFailures++;
          blockReason = blockReason ?? `ML rug probability: ${(rugProb * 100).toFixed(1)}%`;
        } else if (rugProb > 0.5) {
          checks.mlRugDetection = {
            passed: false,
            rugProbability: rugProb,
            details: `ML model: ${(rugProb * 100).toFixed(1)}% rug probability (${mlResult.risk_level})`,
          };
          mediumFailures++;
        } else {
          checks.mlRugDetection = {
            passed: true,
            rugProbability: rugProb,
            details: `ML model: ${(rugProb * 100).toFixed(1)}% rug probability (${mlResult.risk_level})`,
          };
        }
      } else {
        checks.mlRugDetection = {
          passed: true,
          rugProbability: 0,
          details: 'ML model: No prediction available',
        };
      }
    } else {
      checks.mlRugDetection = {
        passed: true,
        rugProbability: 0,
        details: 'ML model: Sidecar not configured',
      };
    }
  } catch (err) {
    log.debug(`ML rug detection failed: ${err instanceof Error ? err.message : String(err)}`);
    checks.mlRugDetection = {
      passed: true,
      rugProbability: 0,
      details: 'ML model: Check unavailable',
    };
  }

  // -----------------------------------------------------------------------
  // 3. Honeypot simulation (buy/sell tax analysis)
  // -----------------------------------------------------------------------
  try {
    if (tokenSecurity) {
      const sellTaxPct = tokenSecurity.sellTax * 100;
      const isHoneypot = tokenSecurity.isHoneypot;
      const cannotSell = tokenSecurity.cannotSellAll;

      if (isHoneypot || cannotSell) {
        checks.honeypotSimulation = {
          passed: false,
          details:
            `Honeypot: ${isHoneypot ? 'confirmed honeypot' : ''}${cannotSell ? ' cannot sell all tokens' : ''}`.trim(),
        };
        criticalFailures++;
        blockReason = blockReason ?? 'Token is a confirmed honeypot';
      } else if (sellTaxPct > 50) {
        checks.honeypotSimulation = {
          passed: false,
          details: `Honeypot: Sell tax ${sellTaxPct.toFixed(1)}% exceeds 50% threshold`,
        };
        criticalFailures++;
        blockReason = blockReason ?? `Sell tax too high: ${sellTaxPct.toFixed(1)}%`;
      } else if (sellTaxPct > 10) {
        checks.honeypotSimulation = {
          passed: false,
          details: `Honeypot: Sell tax ${sellTaxPct.toFixed(1)}% is elevated`,
        };
        mediumFailures++;
      } else {
        checks.honeypotSimulation = {
          passed: true,
          details: `Honeypot: No honeypot indicators (sell tax: ${sellTaxPct.toFixed(1)}%)`,
        };
      }
    } else {
      checks.honeypotSimulation = {
        passed: true,
        details: 'Honeypot: Unable to simulate (no security data)',
      };
    }
  } catch (err) {
    log.debug(`Honeypot simulation failed: ${err instanceof Error ? err.message : String(err)}`);
    checks.honeypotSimulation = {
      passed: true,
      details: 'Honeypot: Simulation unavailable',
    };
  }

  // -----------------------------------------------------------------------
  // 4. Creator reputation check
  // -----------------------------------------------------------------------
  try {
    const creatorAddress = tokenSecurity?.creatorAddress;
    if (creatorAddress && creatorAddress.length > 0) {
      const tracker = new SmartMoneyTracker();
      const reputation = await tracker.getCreatorReputation(creatorAddress);

      if (reputation.ruggedProjects > 0 && reputation.reputationScore < 20) {
        checks.creatorReputation = {
          passed: false,
          score: reputation.reputationScore,
          details: `Creator ${creatorAddress.slice(0, 10)}...: score ${reputation.reputationScore}/100, ${reputation.ruggedProjects} rugged projects`,
        };
        criticalFailures++;
        blockReason =
          blockReason ??
          `Creator has ${reputation.ruggedProjects} rugged projects (score: ${reputation.reputationScore})`;
      } else if (reputation.reputationScore < 40) {
        checks.creatorReputation = {
          passed: false,
          score: reputation.reputationScore,
          details: `Creator ${creatorAddress.slice(0, 10)}...: low reputation score ${reputation.reputationScore}/100`,
        };
        mediumFailures++;
      } else {
        checks.creatorReputation = {
          passed: true,
          score: reputation.reputationScore,
          details: `Creator ${creatorAddress.slice(0, 10)}...: score ${reputation.reputationScore}/100 (${reputation.totalProjects} projects)`,
        };
      }
    } else {
      checks.creatorReputation = {
        passed: true,
        score: 50,
        details: 'Creator: Address not available',
      };
    }
  } catch (err) {
    log.debug(
      `Creator reputation check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    checks.creatorReputation = {
      passed: true,
      score: 50,
      details: 'Creator: Check unavailable',
    };
  }

  // -----------------------------------------------------------------------
  // 5. Aggregate overall risk
  // -----------------------------------------------------------------------
  let overallRisk: PreTradeSafetyResult['overallRisk'];

  if (criticalFailures > 0) {
    overallRisk = 'critical';
  } else if (mediumFailures >= 2) {
    overallRisk = 'high';
  } else if (mediumFailures === 1) {
    overallRisk = 'medium';
  } else {
    overallRisk = 'low';
  }

  const safe = overallRisk === 'low' || overallRisk === 'medium';

  log.info(
    `Pre-trade safety gate for ${address} on ${chain}: ${overallRisk} risk, safe=${safe}` +
      (blockReason ? ` — blocked: ${blockReason}` : ''),
  );

  return {
    safe,
    checks,
    overallRisk,
    blockReason: safe ? undefined : blockReason,
  };
}
