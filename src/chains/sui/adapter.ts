// ---------------------------------------------------------------------------
// Sui adapter — implements ChainAdapter for Sui
// ---------------------------------------------------------------------------

import type {
  ChainAdapter,
  Transaction,
  TokenTransfer,
  ContractEvent,
  TokenInfo,
  Holder,
  Block,
  TxHistoryOptions,
  TransferOptions,
  EventOptions,
} from '../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('sui-adapter');

export class SuiAdapter implements ChainAdapter {
  readonly chainId = 'sui';
  readonly name = 'Sui';
  readonly nativeCurrency = { symbol: 'SUI', decimals: 9 };

  private rpcUrl = 'https://fullnode.mainnet.sui.io:443';
  private connected = false;

  async connect(rpcUrl?: string): Promise<void> {
    if (rpcUrl) this.rpcUrl = rpcUrl;
    this.connected = true;
    log.info(`Connected to Sui: ${this.rpcUrl}`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async rpc(method: string, params: unknown[] = []): Promise<unknown> {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (json.error) throw new Error(`Sui RPC: ${json.error.message}`);
    return json.result;
  }

  async getBalance(address: string): Promise<bigint> {
    const result = (await this.rpc('suix_getBalance', [address, '0x2::sui::SUI'])) as {
      totalBalance: string;
    };
    return BigInt(result.totalBalance);
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<bigint> {
    const result = (await this.rpc('suix_getBalance', [address, tokenAddress])) as {
      totalBalance: string;
    };
    return BigInt(result.totalBalance);
  }

  async getTransactionHistory(address: string, options?: TxHistoryOptions): Promise<Transaction[]> {
    const limit = options?.limit ?? 20;
    const result = (await this.rpc('suix_queryTransactionBlocks', [
      { filter: { FromAddress: address } },
      null,
      limit,
      true,
    ])) as { data: { digest: string; timestampMs: string; checkpoint: string }[] };

    return (result.data ?? []).map((tx) => ({
      hash: tx.digest,
      blockNumber: BigInt(tx.checkpoint ?? '0'),
      from: address,
      to: null,
      value: 0n,
      gasUsed: 0n,
      gasPrice: 0n,
      timestamp: Math.floor(Number(tx.timestampMs) / 1000),
      status: 'success' as const,
      input: '',
    }));
  }

  async getTokenTransfers(_address: string, _options?: TransferOptions): Promise<TokenTransfer[]> {
    return [];
  }

  async getContractCode(address: string): Promise<string> {
    const result = (await this.rpc('sui_getObject', [address, { showContent: true }])) as {
      data?: { content?: { type: string } };
    };
    return result.data?.content?.type ?? '';
  }

  async readContract(
    _address: string,
    _abi: readonly unknown[],
    _functionName: string,
    _args?: unknown[],
  ): Promise<unknown> {
    throw new Error('readContract not supported on Sui — use Move call methods');
  }

  async getContractEvents(
    _address: string,
    _abi: readonly unknown[],
    _eventName: string,
    _options?: EventOptions,
  ): Promise<ContractEvent[]> {
    return [];
  }

  async getTokenInfo(address: string): Promise<TokenInfo> {
    const result = (await this.rpc('suix_getCoinMetadata', [address])) as {
      name: string;
      symbol: string;
      decimals: number;
    } | null;

    return {
      address,
      name: result?.name ?? 'Unknown',
      symbol: result?.symbol ?? '???',
      decimals: result?.decimals ?? 9,
      totalSupply: 0n,
    };
  }

  async getTopHolders(_tokenAddress: string, _limit?: number): Promise<Holder[]> {
    return [];
  }

  async getBlockNumber(): Promise<bigint> {
    const result = (await this.rpc('sui_getLatestCheckpointSequenceNumber')) as string;
    return BigInt(result);
  }

  async getBlock(blockNumber: bigint): Promise<Block> {
    const result = (await this.rpc('sui_getCheckpoint', [String(blockNumber)])) as {
      digest: string;
      previousDigest: string;
      timestampMs: string;
      transactions: string[];
    } | null;

    return {
      number: blockNumber,
      hash: result?.digest ?? '',
      parentHash: result?.previousDigest ?? '',
      timestamp: result ? Math.floor(Number(result.timestampMs) / 1000) : 0,
      gasUsed: 0n,
      gasLimit: 0n,
      baseFeePerGas: null,
      transactionCount: result?.transactions?.length ?? 0,
    };
  }
}
