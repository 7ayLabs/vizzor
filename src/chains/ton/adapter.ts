// ---------------------------------------------------------------------------
// TON adapter — implements ChainAdapter for TON blockchain
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

const log = createLogger('ton-adapter');

export class TonAdapter implements ChainAdapter {
  readonly chainId = 'ton';
  readonly name = 'TON';
  readonly nativeCurrency = { symbol: 'TON', decimals: 9 };

  private apiUrl = 'https://toncenter.com/api/v2';
  private connected = false;

  async connect(rpcUrl?: string): Promise<void> {
    if (rpcUrl) this.apiUrl = rpcUrl;
    this.connected = true;
    log.info(`Connected to TON: ${this.apiUrl}`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async api(method: string, params: Record<string, string> = {}): Promise<unknown> {
    const qs = new URLSearchParams(params).toString();
    const url = `${this.apiUrl}/${method}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`TON API: ${res.status}`);
    const json = (await res.json()) as { ok: boolean; result: unknown; error?: string };
    if (!json.ok) throw new Error(`TON API: ${json.error ?? 'unknown error'}`);
    return json.result;
  }

  async getBalance(address: string): Promise<bigint> {
    const result = (await this.api('getAddressBalance', { address })) as string;
    return BigInt(result);
  }

  async getTokenBalance(_address: string, _tokenAddress: string): Promise<bigint> {
    // Jetton balance requires querying the jetton wallet contract
    return 0n;
  }

  async getTransactionHistory(address: string, options?: TxHistoryOptions): Promise<Transaction[]> {
    const limit = options?.limit ?? 20;
    const txns = (await this.api('getTransactions', {
      address,
      limit: String(limit),
    })) as {
      transaction_id: { hash: string };
      utime: number;
      in_msg?: { value: string; source: string; destination: string };
      out_msgs?: { value: string; source: string; destination: string }[];
      fee: string;
    }[];

    return txns.map((tx) => ({
      hash: tx.transaction_id.hash,
      blockNumber: 0n,
      from: tx.in_msg?.source ?? address,
      to: tx.in_msg?.destination ?? null,
      value: BigInt(tx.in_msg?.value ?? '0'),
      gasUsed: BigInt(tx.fee),
      gasPrice: 0n,
      timestamp: tx.utime,
      status: 'success' as const,
      input: '',
    }));
  }

  async getTokenTransfers(_address: string, _options?: TransferOptions): Promise<TokenTransfer[]> {
    return [];
  }

  async getContractCode(address: string): Promise<string> {
    try {
      const result = (await this.api('getAddressInformation', { address })) as {
        code: string;
      };
      return result.code ?? '';
    } catch {
      return '';
    }
  }

  async readContract(
    _address: string,
    _abi: readonly unknown[],
    _functionName: string,
    _args?: unknown[],
  ): Promise<unknown> {
    throw new Error('readContract not supported on TON — use get methods');
  }

  async getContractEvents(
    _address: string,
    _abi: readonly unknown[],
    _eventName: string,
    _options?: EventOptions,
  ): Promise<ContractEvent[]> {
    return [];
  }

  async getTokenInfo(_address: string): Promise<TokenInfo> {
    return {
      address: _address,
      name: 'Jetton',
      symbol: 'JET',
      decimals: 9,
      totalSupply: 0n,
    };
  }

  async getTopHolders(_tokenAddress: string, _limit?: number): Promise<Holder[]> {
    return [];
  }

  async getBlockNumber(): Promise<bigint> {
    const result = (await this.api('getMasterchainInfo')) as {
      last: { seqno: number };
    };
    return BigInt(result.last.seqno);
  }

  async getBlock(blockNumber: bigint): Promise<Block> {
    return {
      number: blockNumber,
      hash: '',
      parentHash: '',
      timestamp: 0,
      gasUsed: 0n,
      gasLimit: 0n,
      baseFeePerGas: null,
      transactionCount: 0,
    };
  }
}
