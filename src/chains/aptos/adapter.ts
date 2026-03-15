// ---------------------------------------------------------------------------
// Aptos adapter — implements ChainAdapter for Aptos
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

const log = createLogger('aptos-adapter');

export class AptosAdapter implements ChainAdapter {
  readonly chainId = 'aptos';
  readonly name = 'Aptos';
  readonly nativeCurrency = { symbol: 'APT', decimals: 8 };

  private apiUrl = 'https://fullnode.mainnet.aptoslabs.com/v1';
  private connected = false;

  async connect(rpcUrl?: string): Promise<void> {
    if (rpcUrl) this.apiUrl = rpcUrl;
    this.connected = true;
    log.info(`Connected to Aptos: ${this.apiUrl}`);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async api(path: string): Promise<unknown> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Aptos API: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      const result = (await this.api(
        `/accounts/${address}/resource/0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>`,
      )) as { data: { coin: { value: string } } };
      return BigInt(result.data.coin.value);
    } catch {
      return 0n;
    }
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<bigint> {
    try {
      const result = (await this.api(
        `/accounts/${address}/resource/0x1::coin::CoinStore<${tokenAddress}>`,
      )) as { data: { coin: { value: string } } };
      return BigInt(result.data.coin.value);
    } catch {
      return 0n;
    }
  }

  async getTransactionHistory(address: string, options?: TxHistoryOptions): Promise<Transaction[]> {
    const limit = options?.limit ?? 20;
    const txns = (await this.api(`/accounts/${address}/transactions?limit=${limit}`)) as {
      hash: string;
      version: string;
      sender: string;
      timestamp: string;
      success: boolean;
      gas_used: string;
      gas_unit_price: string;
    }[];

    return txns.map((tx) => ({
      hash: tx.hash,
      blockNumber: BigInt(tx.version),
      from: tx.sender,
      to: null,
      value: 0n,
      gasUsed: BigInt(tx.gas_used),
      gasPrice: BigInt(tx.gas_unit_price),
      timestamp: Math.floor(Number(tx.timestamp) / 1e6),
      status: tx.success ? ('success' as const) : ('reverted' as const),
      input: '',
    }));
  }

  async getTokenTransfers(_address: string, _options?: TransferOptions): Promise<TokenTransfer[]> {
    return [];
  }

  async getContractCode(address: string): Promise<string> {
    try {
      const result = (await this.api(`/accounts/${address}/modules`)) as { bytecode: string }[];
      return result.map((m) => m.bytecode).join('');
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
    throw new Error('readContract not supported on Aptos — use Move view functions');
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
    return {
      address,
      name: 'Move Coin',
      symbol: 'MOVE',
      decimals: 8,
      totalSupply: 0n,
    };
  }

  async getTopHolders(_tokenAddress: string, _limit?: number): Promise<Holder[]> {
    return [];
  }

  async getBlockNumber(): Promise<bigint> {
    const result = (await this.api('/')) as { ledger_version: string };
    return BigInt(result.ledger_version);
  }

  async getBlock(blockNumber: bigint): Promise<Block> {
    const result = (await this.api(`/blocks/by_version/${blockNumber}`)) as {
      block_hash: string;
      block_height: string;
      block_timestamp: string;
      transactions: unknown[];
    };

    return {
      number: BigInt(result.block_height),
      hash: result.block_hash,
      parentHash: '',
      timestamp: Math.floor(Number(result.block_timestamp) / 1e6),
      gasUsed: 0n,
      gasLimit: 0n,
      baseFeePerGas: null,
      transactionCount: result.transactions?.length ?? 0,
    };
  }
}
