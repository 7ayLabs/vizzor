// ---------------------------------------------------------------------------
// Etherscan-compatible block explorer API client
// Works with Etherscan, Polygonscan, Arbiscan, Basescan, etc.
// ---------------------------------------------------------------------------

import type { Transaction, TokenTransfer, Holder } from '../types.js';

// ---------------------------------------------------------------------------
// Base URLs per chain
// ---------------------------------------------------------------------------

export const EXPLORER_URLS: Record<string, string> = {
  ethereum: 'https://api.etherscan.io/api',
  polygon: 'https://api.polygonscan.com/api',
  arbitrum: 'https://api.arbiscan.io/api',
  optimism: 'https://api-optimistic.etherscan.io/api',
  base: 'https://api.basescan.org/api',
};

// ---------------------------------------------------------------------------
// Raw API response types
// ---------------------------------------------------------------------------

interface EtherscanResult<T> {
  status: string;
  message: string;
  result: T;
}

interface RawTransaction {
  hash: string;
  blockNumber: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  timeStamp: string;
  isError: string;
  input: string;
}

interface RawTokenTransfer {
  hash: string;
  blockNumber: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenSymbol: string;
  tokenDecimal: string;
  timeStamp: string;
}

interface RawHolder {
  TokenHolderAddress: string;
  TokenHolderQuantity: string;
  // percentage not directly available from Etherscan
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class EtherscanClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey ?? '';
  }

  // ── Transactions ──────────────────────────────────────────────────────

  async getTransactions(
    address: string,
    options?: { limit?: number; offset?: number; fromBlock?: bigint; toBlock?: bigint },
  ): Promise<Transaction[]> {
    const params: Record<string, string> = {
      module: 'account',
      action: 'txlist',
      address,
      sort: 'desc',
      page: '1',
      offset: String(options?.limit ?? 50),
    };
    if (options?.fromBlock != null) params['startblock'] = options.fromBlock.toString();
    if (options?.toBlock != null) params['endblock'] = options.toBlock.toString();

    const data = await this.request<RawTransaction[]>(params);
    if (!Array.isArray(data)) return [];

    return data.map(
      (tx): Transaction => ({
        hash: tx.hash,
        blockNumber: BigInt(tx.blockNumber),
        from: tx.from,
        to: tx.to || null,
        value: BigInt(tx.value),
        gasUsed: BigInt(tx.gasUsed),
        gasPrice: BigInt(tx.gasPrice),
        timestamp: Number(tx.timeStamp),
        status: tx.isError === '0' ? 'success' : 'reverted',
        input: tx.input,
      }),
    );
  }

  // ── Token Transfers ───────────────────────────────────────────────────

  async getTokenTransfers(
    address: string,
    options?: { tokenAddress?: string; limit?: number; fromBlock?: bigint; toBlock?: bigint },
  ): Promise<TokenTransfer[]> {
    const params: Record<string, string> = {
      module: 'account',
      action: 'tokentx',
      address,
      sort: 'desc',
      page: '1',
      offset: String(options?.limit ?? 50),
    };
    if (options?.tokenAddress) params['contractaddress'] = options.tokenAddress;
    if (options?.fromBlock != null) params['startblock'] = options.fromBlock.toString();
    if (options?.toBlock != null) params['endblock'] = options.toBlock.toString();

    const data = await this.request<RawTokenTransfer[]>(params);
    if (!Array.isArray(data)) return [];

    return data.map(
      (t): TokenTransfer => ({
        hash: t.hash,
        blockNumber: BigInt(t.blockNumber),
        from: t.from,
        to: t.to,
        value: BigInt(t.value),
        tokenAddress: t.contractAddress,
        tokenSymbol: t.tokenSymbol,
        tokenDecimals: Number(t.tokenDecimal),
        timestamp: Number(t.timeStamp),
      }),
    );
  }

  // ── Top Holders ───────────────────────────────────────────────────────

  async getTopHolders(tokenAddress: string, limit = 10): Promise<Holder[]> {
    // Note: Etherscan top holders endpoint is only on Pro plan.
    // We use the tokentx approach or fall back gracefully.
    const params: Record<string, string> = {
      module: 'token',
      action: 'tokenholderlist',
      contractaddress: tokenAddress,
      page: '1',
      offset: String(limit),
    };

    try {
      const data = await this.request<RawHolder[]>(params);
      if (!Array.isArray(data)) return [];

      // Calculate percentages from balances
      const totalBalance = data.reduce((sum, h) => sum + BigInt(h.TokenHolderQuantity), 0n);

      return data.map(
        (h): Holder => ({
          address: h.TokenHolderAddress,
          balance: BigInt(h.TokenHolderQuantity),
          percentage:
            totalBalance > 0n
              ? Number((BigInt(h.TokenHolderQuantity) * 10000n) / totalBalance) / 100
              : 0,
        }),
      );
    } catch {
      // Top holders endpoint may not be available on free tier
      return [];
    }
  }

  // ── Contract ABI ──────────────────────────────────────────────────────

  async getContractAbi(address: string): Promise<string | null> {
    const params: Record<string, string> = {
      module: 'contract',
      action: 'getabi',
      address,
    };

    try {
      const data = await this.request<string>(params);
      return typeof data === 'string' && data !== 'Contract source code not verified' ? data : null;
    } catch {
      return null;
    }
  }

  // ── Contract Verification Check ───────────────────────────────────────

  async isContractVerified(address: string): Promise<boolean> {
    const abi = await this.getContractAbi(address);
    return abi !== null;
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private async request<T>(params: Record<string, string>): Promise<T> {
    if (this.apiKey) {
      params['apikey'] = this.apiKey;
    }

    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${this.baseUrl}?${qs}`);

    if (!res.ok) {
      throw new Error(`Etherscan API error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as EtherscanResult<T>;

    if (json.status !== '1' && json.message !== 'OK' && json.message !== 'No transactions found') {
      // Some endpoints return status "0" with "No records found" which is valid
      if (json.message?.includes('No') || json.message?.includes('no')) {
        return [] as unknown as T;
      }
      throw new Error(`Etherscan: ${json.message}`);
    }

    return json.result;
  }
}
