// ---------------------------------------------------------------------------
// ChainAdapter – read-only blockchain access interface
// ---------------------------------------------------------------------------

/** Options for paginated transaction history queries. */
export interface TxHistoryOptions {
  /** Number of results to return (default decided by adapter). */
  readonly limit?: number;
  /** Pagination cursor / offset. */
  readonly offset?: number;
  /** Only include transactions after this block number. */
  readonly fromBlock?: bigint;
  /** Only include transactions up to this block number. */
  readonly toBlock?: bigint;
}

/** Options for token transfer queries. */
export interface TransferOptions {
  /** Token contract address to filter by. */
  readonly tokenAddress?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
}

/** Options for contract event queries. */
export interface EventOptions {
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
  readonly args?: Record<string, unknown>;
}

/** A normalised on-chain transaction. */
export interface Transaction {
  readonly hash: string;
  readonly blockNumber: bigint;
  readonly from: string;
  readonly to: string | null;
  readonly value: bigint;
  readonly gasUsed: bigint;
  readonly gasPrice: bigint;
  readonly timestamp: number;
  readonly status: 'success' | 'reverted';
  readonly input: string;
}

/** A normalised ERC-20 / token transfer event. */
export interface TokenTransfer {
  readonly hash: string;
  readonly blockNumber: bigint;
  readonly from: string;
  readonly to: string;
  readonly value: bigint;
  readonly tokenAddress: string;
  readonly tokenSymbol?: string;
  readonly tokenDecimals?: number;
  readonly timestamp: number;
}

/** A decoded contract event log. */
export interface ContractEvent {
  readonly eventName: string;
  readonly blockNumber: bigint;
  readonly transactionHash: string;
  readonly args: Record<string, unknown>;
  readonly logIndex: number;
}

/** ERC-20 (or similar) token metadata. */
export interface TokenInfo {
  readonly address: string;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly totalSupply: bigint;
}

/** A token holder entry. */
export interface Holder {
  readonly address: string;
  readonly balance: bigint;
  readonly percentage: number;
}

/** Normalised block data. */
export interface Block {
  readonly number: bigint;
  readonly hash: string;
  readonly parentHash: string;
  readonly timestamp: number;
  readonly gasUsed: bigint;
  readonly gasLimit: bigint;
  readonly baseFeePerGas: bigint | null;
  readonly transactionCount: number;
}

/** Static configuration for registering a chain. */
export interface ChainConfig {
  readonly chainId: string;
  readonly name: string;
  readonly nativeCurrency: { readonly symbol: string; readonly decimals: number };
  readonly rpcUrl?: string;
  readonly explorerUrl?: string;
  readonly explorerApiKey?: string;
}

// ---------------------------------------------------------------------------
// Core interface – every chain adapter must implement this.
// ---------------------------------------------------------------------------

export interface ChainAdapter {
  readonly chainId: string;
  readonly name: string;
  readonly nativeCurrency: { symbol: string; decimals: number };

  // Lifecycle
  connect(rpcUrl?: string, explorerApiKey?: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Balances
  getBalance(address: string): Promise<bigint>;
  getTokenBalance(address: string, tokenAddress: string): Promise<bigint>;
  getTransactionHistory(address: string, options?: TxHistoryOptions): Promise<Transaction[]>;
  getTokenTransfers(address: string, options?: TransferOptions): Promise<TokenTransfer[]>;

  // Contracts
  getContractCode(address: string): Promise<string>;
  readContract(
    address: string,
    abi: readonly unknown[],
    functionName: string,
    args?: unknown[],
  ): Promise<unknown>;
  getContractEvents(
    address: string,
    abi: readonly unknown[],
    eventName: string,
    options?: EventOptions,
  ): Promise<ContractEvent[]>;

  // Tokens
  getTokenInfo(address: string): Promise<TokenInfo>;
  getTopHolders(tokenAddress: string, limit?: number): Promise<Holder[]>;

  // Blocks
  getBlockNumber(): Promise<bigint>;
  getBlock(blockNumber: bigint): Promise<Block>;
}

// ---------------------------------------------------------------------------
// Writable chain adapter — extends read-only with transaction capabilities
// ---------------------------------------------------------------------------

export interface TransactionRequest {
  readonly to: string;
  readonly value?: bigint;
  readonly data?: string;
  readonly gasLimit?: bigint;
  readonly maxFeePerGas?: bigint;
  readonly maxPriorityFeePerGas?: bigint;
}

export interface TransactionReceipt {
  readonly hash: string;
  readonly blockNumber: bigint;
  readonly status: 'success' | 'reverted';
  readonly gasUsed: bigint;
  readonly effectiveGasPrice: bigint;
  readonly logs: readonly { address: string; topics: string[]; data: string }[];
}

export interface WritableChainAdapter extends ChainAdapter {
  sendTransaction(tx: TransactionRequest): Promise<TransactionReceipt>;
  writeContract(
    address: string,
    abi: readonly unknown[],
    functionName: string,
    args?: unknown[],
    value?: bigint,
  ): Promise<TransactionReceipt>;
  signMessage(message: string): Promise<string>;
  estimateGas(tx: TransactionRequest): Promise<bigint>;
}
