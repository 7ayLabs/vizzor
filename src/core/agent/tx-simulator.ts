// ---------------------------------------------------------------------------
// Transaction simulator — eth_call simulation before execution
// ---------------------------------------------------------------------------

import type { WritableChainAdapter } from '../../chains/types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tx-simulator');

export interface SimulationResult {
  success: boolean;
  gasEstimate: bigint;
  returnData?: string;
  error?: string;
  revertReason?: string;
}

// Common Solidity revert error signatures
const REVERT_SIGNATURES: Record<string, string> = {
  '0x08c379a0': 'Error(string)',
  '0x4e487b71': 'Panic(uint256)',
};

export class TxSimulator {
  private adapter: WritableChainAdapter;

  constructor(adapter: WritableChainAdapter) {
    this.adapter = adapter;
    log.info(`Transaction simulator initialized for chain ${adapter.chainId}`);
  }

  async simulate(tx: {
    to: string;
    data?: string;
    value?: bigint;
    from?: string;
  }): Promise<SimulationResult> {
    log.info(`Simulating tx to=${tx.to} value=${tx.value ?? 0n}`);

    try {
      // Use readContract via a raw call to simulate (eth_call)
      const returnData = (await this.adapter.readContract(
        tx.to,
        [
          {
            type: 'function',
            name: 'fallback',
            inputs: [],
            outputs: [{ type: 'bytes', name: '' }],
            stateMutability: 'payable',
          },
        ],
        'fallback',
        tx.data ? [tx.data] : [],
      )) as string | undefined;

      // Estimate gas
      const gasEstimate = await this.adapter.estimateGas({
        to: tx.to,
        value: tx.value,
        data: tx.data,
      });

      log.info(`Simulation success: gas=${gasEstimate}`);

      return {
        success: true,
        gasEstimate,
        returnData: returnData ?? undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const revertReason = this.extractRevertReason(message);

      log.warn(`Simulation failed: ${revertReason ?? message}`);

      // Try to get gas estimate even on revert
      let gasEstimate = 0n;
      try {
        gasEstimate = await this.adapter.estimateGas({
          to: tx.to,
          value: tx.value,
          data: tx.data,
        });
      } catch {
        // Gas estimation also failed
      }

      return {
        success: false,
        gasEstimate,
        error: message,
        revertReason: revertReason ?? undefined,
      };
    }
  }

  async simulateSwap(params: {
    router: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    recipient: string;
  }): Promise<SimulationResult & { estimatedOutput?: bigint }> {
    log.info(`Simulating swap: ${params.amountIn} ${params.tokenIn} → ${params.tokenOut}`);

    const swapAbi = [
      {
        type: 'function',
        name: 'exactInputSingle',
        inputs: [
          {
            components: [
              { name: 'tokenIn', type: 'address' },
              { name: 'tokenOut', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'recipient', type: 'address' },
              { name: 'amountIn', type: 'uint256' },
              { name: 'amountOutMinimum', type: 'uint256' },
              { name: 'sqrtPriceLimitX96', type: 'uint160' },
            ],
            name: 'params',
            type: 'tuple',
          },
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
      },
    ] as const;

    try {
      const result = await this.adapter.readContract(params.router, swapAbi, 'exactInputSingle', [
        {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          fee: 3000,
          recipient: params.recipient,
          amountIn: params.amountIn,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        },
      ]);

      const gasEstimate = await this.adapter.estimateGas({
        to: params.router,
      });

      const estimatedOutput = typeof result === 'bigint' ? result : undefined;

      log.info(`Swap simulation success: estimatedOutput=${estimatedOutput} gas=${gasEstimate}`);

      return {
        success: true,
        gasEstimate,
        estimatedOutput,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const revertReason = this.extractRevertReason(message);

      log.warn(`Swap simulation failed: ${revertReason ?? message}`);

      return {
        success: false,
        gasEstimate: 0n,
        error: message,
        revertReason: revertReason ?? undefined,
      };
    }
  }

  private extractRevertReason(errorMessage: string): string | null {
    // Try to find common revert patterns
    for (const [sig, name] of Object.entries(REVERT_SIGNATURES)) {
      if (errorMessage.includes(sig)) {
        return `Revert: ${name}`;
      }
    }

    // Check for "execution reverted" pattern
    const revertMatch = errorMessage.match(/execution reverted:?\s*(.*?)(?:\n|$)/i);
    if (revertMatch?.[1]) {
      return revertMatch[1].trim();
    }

    // Check for reason string
    const reasonMatch = errorMessage.match(/reason="([^"]+)"/);
    if (reasonMatch?.[1]) {
      return reasonMatch[1];
    }

    return null;
  }
}
