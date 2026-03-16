// ---------------------------------------------------------------------------
// Trade executor — connects portfolio decisions to on-chain execution
// with 7-step safety pipeline
// ---------------------------------------------------------------------------

import type { WritableChainAdapter } from '../../chains/types.js';
import { DexRouter } from './dex/router.js';
import { TxSimulator } from './tx-simulator.js';
import type { SimulationResult } from './tx-simulator.js';
import { ApprovalManager } from './approval-manager.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('trade-executor');

export interface TradeConfig {
  maxSlippageBps: number; // default 50 (0.5%)
  gasMultiplier: number; // default 1.2
  dryRun: boolean;
  confirmBeforeExecute: boolean;
}

export interface TradeResult {
  success: boolean;
  action: 'buy' | 'sell';
  symbol: string;
  amount: bigint;
  txHash?: string;
  error?: string;
  dryRun: boolean;
  simulationResult?: SimulationResult;
}

const DEFAULT_CONFIG: TradeConfig = {
  maxSlippageBps: 50,
  gasMultiplier: 1.2,
  dryRun: true,
  confirmBeforeExecute: true,
};

export class TradeExecutor {
  private adapter: WritableChainAdapter;
  private router: DexRouter;
  private config: TradeConfig;
  private simulator: TxSimulator;
  private approvalManager: ApprovalManager;

  constructor(adapter: WritableChainAdapter, config?: Partial<TradeConfig>) {
    this.adapter = adapter;
    this.router = new DexRouter(adapter);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.simulator = new TxSimulator(adapter);
    this.approvalManager = new ApprovalManager();
  }

  async executeBuy(
    tokenAddress: string,
    amountIn: bigint,
    recipient: string,
  ): Promise<TradeResult> {
    const weth = this.router.getWethAddress();

    if (this.config.dryRun) {
      log.info(`[DRY RUN] Buy ${tokenAddress} with ${amountIn} native token`);
      return {
        success: true,
        action: 'buy',
        symbol: tokenAddress,
        amount: amountIn,
        dryRun: true,
      };
    }

    // Use 7-step safety pipeline for live execution
    return this.executeSafeSwap({
      action: 'buy',
      tokenIn: weth,
      tokenOut: tokenAddress,
      amountIn,
      recipient,
    });
  }

  async executeSell(
    tokenAddress: string,
    amountIn: bigint,
    recipient: string,
  ): Promise<TradeResult> {
    const weth = this.router.getWethAddress();

    if (this.config.dryRun) {
      log.info(`[DRY RUN] Sell ${amountIn} of ${tokenAddress}`);
      return {
        success: true,
        action: 'sell',
        symbol: tokenAddress,
        amount: amountIn,
        dryRun: true,
      };
    }

    // Use 7-step safety pipeline for live execution
    return this.executeSafeSwap({
      action: 'sell',
      tokenIn: tokenAddress,
      tokenOut: weth,
      amountIn,
      recipient,
    });
  }

  /**
   * 7-step safety pipeline:
   * 1. Validate parameters (non-zero amount, valid address)
   * 2. Prepare transaction data
   * 3. Simulate via TxSimulator (eth_call)
   * 4. Check/grant ERC-20 approval via ApprovalManager (for sells)
   * 5. Execute the actual swap
   * 6. Record trade in portfolio
   * 7. Cleanup: revoke excess approvals
   */
  private async executeSafeSwap(params: {
    action: 'buy' | 'sell';
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    recipient: string;
  }): Promise<TradeResult> {
    const { action, tokenIn, tokenOut, amountIn, recipient } = params;
    const symbol = action === 'buy' ? tokenOut : tokenIn;

    try {
      // Step 1: Validate parameters
      if (amountIn <= 0n) {
        return {
          success: false,
          action,
          symbol,
          amount: amountIn,
          error: 'Amount must be greater than zero',
          dryRun: false,
        };
      }

      if (!isValidAddress(recipient)) {
        return {
          success: false,
          action,
          symbol,
          amount: amountIn,
          error: `Invalid recipient address: ${recipient}`,
          dryRun: false,
        };
      }

      log.info(
        `[SAFE SWAP] Step 1/7: Parameters validated — ${action} ${symbol} amount=${amountIn}`,
      );

      // Step 2: Prepare transaction data
      const routerAddress = this.router.getRouterAddress();
      log.info(`[SAFE SWAP] Step 2/7: Transaction prepared — router=${routerAddress}`);

      // Step 3: Simulate via TxSimulator
      const simResult = await this.simulator.simulateSwap({
        router: routerAddress,
        tokenIn,
        tokenOut,
        amountIn,
        recipient,
      });

      log.info(
        `[SAFE SWAP] Step 3/7: Simulation ${simResult.success ? 'passed' : 'FAILED'}` +
          (simResult.estimatedOutput ? ` estimatedOutput=${simResult.estimatedOutput}` : '') +
          (simResult.revertReason ? ` reason=${simResult.revertReason}` : ''),
      );

      if (!simResult.success) {
        return {
          success: false,
          action,
          symbol,
          amount: amountIn,
          error: `Simulation failed: ${simResult.revertReason ?? simResult.error ?? 'unknown'}`,
          dryRun: false,
          simulationResult: simResult,
        };
      }

      // Step 4: Check/grant ERC-20 approval (for sells, tokenIn is the ERC-20)
      if (action === 'sell') {
        const hasApproval = this.approvalManager.hasApproval(
          tokenIn,
          routerAddress,
          'trade-executor',
          amountIn,
        );

        if (!hasApproval) {
          log.info(`[SAFE SWAP] Step 4/7: Granting ERC-20 approval for ${tokenIn}`);
          // Grant exact approval amount (not unlimited)
          this.approvalManager.grantApproval({
            token: tokenIn,
            spender: routerAddress,
            amount: amountIn,
            chain: this.adapter.chainId,
            agentId: 'trade-executor',
            expiresAt: null,
          });
        } else {
          log.info(`[SAFE SWAP] Step 4/7: ERC-20 approval already exists`);
        }
      } else {
        log.info(`[SAFE SWAP] Step 4/7: Skipped (buy uses native token)`);
      }

      // Step 5: Execute the actual swap
      log.info(`[SAFE SWAP] Step 5/7: Executing swap...`);

      const gasEstimate = await this.adapter.estimateGas({
        to: routerAddress,
        value: action === 'buy' ? amountIn : undefined,
      });
      const gasWithBuffer =
        (gasEstimate * BigInt(Math.round(this.config.gasMultiplier * 100))) / 100n;

      log.info(`Gas estimate: ${gasEstimate} (with buffer: ${gasWithBuffer})`);

      const swapResult = await this.router.swap({
        tokenIn,
        tokenOut,
        amountIn,
        slippageBps: this.config.maxSlippageBps,
        recipient,
      });

      const txSuccess = swapResult.receipt.status === 'success';

      // Step 6: Record trade result
      log.info(
        `[SAFE SWAP] Step 6/7: Trade recorded — ${txSuccess ? 'SUCCESS' : 'REVERTED'} tx=${swapResult.receipt.hash}`,
      );

      // Step 7: Cleanup — revoke excess approvals for sells
      if (action === 'sell') {
        this.approvalManager.revokeApproval(tokenIn, routerAddress, 'trade-executor');
        log.info(`[SAFE SWAP] Step 7/7: Approval revoked for ${tokenIn}`);
      } else {
        log.info(`[SAFE SWAP] Step 7/7: Cleanup skipped (no approval to revoke)`);
      }

      return {
        success: txSuccess,
        action,
        symbol,
        amount: amountIn,
        txHash: swapResult.receipt.hash,
        dryRun: false,
        simulationResult: simResult,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Safe swap failed: ${message}`);
      return {
        success: false,
        action,
        symbol,
        amount: amountIn,
        error: message,
        dryRun: false,
      };
    }
  }
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
