// ---------------------------------------------------------------------------
// EvmAdapter – ChainAdapter implementation for EVM-compatible chains (viem)
// ---------------------------------------------------------------------------

import {
  createPublicClient,
  http,
  type PublicClient,
  type Chain,
  type HttpTransport,
  type Address,
  type Abi,
} from 'viem';
import { mainnet, polygon, arbitrum, optimism, base, bsc, avalanche } from 'viem/chains';
import { assertValidAddress } from '../../utils/validate.js';

import type {
  ChainAdapter,
  Block,
  ContractEvent,
  EventOptions,
  Holder,
  TokenInfo,
  TokenTransfer,
  Transaction,
  TransferOptions,
  TxHistoryOptions,
} from '../types.js';
import { erc20Abi } from './abi/erc20.js';
import { EtherscanClient } from './etherscan.js';
import { ETHERSCAN_BASE_URLS } from '../../config/constants.js';

// ---------------------------------------------------------------------------
// Chain ID → viem Chain object mapping
// ---------------------------------------------------------------------------

const CHAIN_MAP: Record<string, Chain> = {
  ethereum: mainnet,
  polygon: polygon,
  arbitrum: arbitrum,
  optimism: optimism,
  base: base,
  bsc: bsc,
  avalanche: avalanche,
};

// ---------------------------------------------------------------------------
// EvmAdapter
// ---------------------------------------------------------------------------

export class EvmAdapter implements ChainAdapter {
  readonly chainId: string;
  readonly name: string;
  readonly nativeCurrency: { symbol: string; decimals: number };

  private client: PublicClient<HttpTransport, Chain> | null = null;
  private etherscan: EtherscanClient | null = null;
  private readonly viemChain: Chain;

  constructor(chainId: string) {
    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      throw new Error(
        `Unsupported EVM chain: "${chainId}". Supported: ${Object.keys(CHAIN_MAP).join(', ')}`,
      );
    }

    this.chainId = chainId;
    this.viemChain = chain;
    this.name = chain.name;
    this.nativeCurrency = {
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async connect(rpcUrl?: string, etherscanApiKey?: string): Promise<void> {
    this.client = createPublicClient({
      chain: this.viemChain,
      transport: http(rpcUrl),
      batch: { multicall: true },
    });

    // Create Etherscan client if a base URL is known for this chain
    const explorerUrl = ETHERSCAN_BASE_URLS[this.chainId];
    if (explorerUrl) {
      this.etherscan = new EtherscanClient(explorerUrl, etherscanApiKey);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.etherscan = null;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  /** Validate and cast to viem Address. */
  private toAddress(address: string): Address {
    assertValidAddress(address);
    return this.toAddress(address);
  }

  // ── Balances ────────────────────────────────────────────────────────────

  async getBalance(address: string): Promise<bigint> {
    const client = this.requireClient();
    return client.getBalance({ address: this.toAddress(address) });
  }

  async getTokenBalance(address: string, tokenAddress: string): Promise<bigint> {
    const client = this.requireClient();
    const balance = await client.readContract({
      address: this.toAddress(tokenAddress),
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [this.toAddress(address)],
    });
    return balance as bigint;
  }

  async getTransactionHistory(address: string, options?: TxHistoryOptions): Promise<Transaction[]> {
    if (!this.etherscan) return [];
    return this.etherscan.getTransactions(address, {
      limit: options?.limit,
      offset: options?.offset,
      fromBlock: options?.fromBlock,
      toBlock: options?.toBlock,
    });
  }

  async getTokenTransfers(address: string, options?: TransferOptions): Promise<TokenTransfer[]> {
    if (!this.etherscan) return [];
    return this.etherscan.getTokenTransfers(address, {
      tokenAddress: options?.tokenAddress,
      limit: options?.limit,
      fromBlock: options?.fromBlock,
      toBlock: options?.toBlock,
    });
  }

  // ── Contracts ───────────────────────────────────────────────────────────

  async getContractCode(address: string): Promise<string> {
    const client = this.requireClient();
    const code = await client.getCode({ address: this.toAddress(address) });
    return code ?? '0x';
  }

  async readContract(
    address: string,
    abi: readonly unknown[],
    functionName: string,
    args?: unknown[],
  ): Promise<unknown> {
    const client = this.requireClient();
    return client.readContract({
      address: this.toAddress(address),
      abi: abi as Abi,
      functionName,
      args: args as readonly unknown[],
    });
  }

  async getContractEvents(
    address: string,
    abi: readonly unknown[],
    eventName: string,
    options?: EventOptions,
  ): Promise<ContractEvent[]> {
    const client = this.requireClient();

    const logs = await client.getContractEvents({
      address: this.toAddress(address),
      abi: abi as Abi,
      eventName,
      fromBlock: options?.fromBlock,
      toBlock: options?.toBlock,
      args: options?.args as Record<string, unknown> | undefined,
    });

    return logs.map((log) => ({
      eventName: log.eventName ?? eventName,
      blockNumber: log.blockNumber ?? 0n,
      transactionHash: log.transactionHash ?? '0x',
      args: (log.args ?? {}) as Record<string, unknown>,
      logIndex: log.logIndex ?? 0,
    }));
  }

  // ── Tokens ──────────────────────────────────────────────────────────────

  async getTokenInfo(address: string): Promise<TokenInfo> {
    const client = this.requireClient();
    const tokenAddr = this.toAddress(address);

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      client.readContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: 'name',
      }) as Promise<string>,
      client.readContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: 'symbol',
      }) as Promise<string>,
      client.readContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: 'decimals',
      }) as Promise<number>,
      client.readContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: 'totalSupply',
      }) as Promise<bigint>,
    ]);

    return { address, name, symbol, decimals, totalSupply };
  }

  async getTopHolders(tokenAddress: string, limit?: number): Promise<Holder[]> {
    if (!this.etherscan) return [];
    return this.etherscan.getTopHolders(tokenAddress, limit);
  }

  // ── Blocks ──────────────────────────────────────────────────────────────

  async getBlockNumber(): Promise<bigint> {
    const client = this.requireClient();
    return client.getBlockNumber();
  }

  async getBlock(blockNumber: bigint): Promise<Block> {
    const client = this.requireClient();
    const block = await client.getBlock({ blockNumber });

    return {
      number: block.number ?? 0n,
      hash: block.hash ?? '0x',
      parentHash: block.parentHash,
      timestamp: Number(block.timestamp),
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      baseFeePerGas: block.baseFeePerGas ?? null,
      transactionCount: block.transactions.length,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private requireClient(): PublicClient<HttpTransport, Chain> {
    if (!this.client) {
      throw new Error(`EvmAdapter(${this.chainId}): not connected. Call connect() first.`);
    }
    return this.client;
  }
}
