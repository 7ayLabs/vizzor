// ---------------------------------------------------------------------------
// Solana adapter — implements ChainAdapter for Solana
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

const log = createLogger('solana-adapter');

export class SolanaAdapter implements ChainAdapter {
  readonly chainId = 'solana';
  readonly name = 'Solana';
  readonly nativeCurrency = { symbol: 'SOL', decimals: 9 };

  private rpcUrl = 'https://api.mainnet-beta.solana.com';
  private connected = false;

  async connect(rpcUrl?: string): Promise<void> {
    if (rpcUrl) this.rpcUrl = rpcUrl;
    this.connected = true;
    log.info(`Connected to Solana: ${this.rpcUrl}`);
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
    if (json.error) throw new Error(`Solana RPC: ${json.error.message}`);
    return json.result;
  }

  async getBalance(address: string): Promise<bigint> {
    const result = (await this.rpc('getBalance', [address])) as { value: number };
    return BigInt(result.value);
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<bigint> {
    const result = (await this.rpc('getTokenAccountsByOwner', [
      address,
      { mint: tokenAddress },
      { encoding: 'jsonParsed' },
    ])) as {
      value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[];
    };
    if (result.value.length === 0) return 0n;
    return BigInt(result.value[0]!.account.data.parsed.info.tokenAmount.amount);
  }

  async getTransactionHistory(address: string, options?: TxHistoryOptions): Promise<Transaction[]> {
    const limit = options?.limit ?? 20;
    const sigs = (await this.rpc('getSignaturesForAddress', [address, { limit }])) as {
      signature: string;
      blockTime: number;
      slot: number;
      err: unknown;
    }[];

    return sigs.map((s) => ({
      hash: s.signature,
      blockNumber: BigInt(s.slot),
      from: address,
      to: null,
      value: 0n,
      gasUsed: 0n,
      gasPrice: 0n,
      timestamp: s.blockTime ?? 0,
      status: s.err ? ('reverted' as const) : ('success' as const),
      input: '',
    }));
  }

  async getTokenTransfers(_address: string, _options?: TransferOptions): Promise<TokenTransfer[]> {
    // Solana token transfers require parsing transaction data
    return [];
  }

  async getContractCode(address: string): Promise<string> {
    const result = (await this.rpc('getAccountInfo', [address, { encoding: 'base64' }])) as {
      value: { data: string[] } | null;
    };
    return result?.value?.data?.[0] ?? '';
  }

  async readContract(
    _address: string,
    _abi: readonly unknown[],
    _functionName: string,
    _args?: unknown[],
  ): Promise<unknown> {
    throw new Error('readContract not supported on Solana — use program-specific methods');
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
    const result = (await this.rpc('getAccountInfo', [address, { encoding: 'jsonParsed' }])) as {
      value: { data: { parsed: { info: { decimals: number; supply: string } } } } | null;
    };

    const info = result?.value?.data?.parsed?.info;
    return {
      address,
      name: 'SPL Token',
      symbol: 'SPL',
      decimals: info?.decimals ?? 9,
      totalSupply: BigInt(info?.supply ?? '0'),
    };
  }

  async getTopHolders(_tokenAddress: string, _limit?: number): Promise<Holder[]> {
    return [];
  }

  async getBlockNumber(): Promise<bigint> {
    const slot = (await this.rpc('getSlot')) as number;
    return BigInt(slot);
  }

  async getBlock(blockNumber: bigint): Promise<Block> {
    const result = (await this.rpc('getBlock', [
      Number(blockNumber),
      { transactionDetails: 'none' },
    ])) as {
      blockhash: string;
      parentSlot: number;
      blockTime: number;
      transactions: unknown[];
    } | null;

    return {
      number: blockNumber,
      hash: result?.blockhash ?? '',
      parentHash: '',
      timestamp: result?.blockTime ?? 0,
      gasUsed: 0n,
      gasLimit: 0n,
      baseFeePerGas: null,
      transactionCount: result?.transactions?.length ?? 0,
    };
  }
}
