// ---------------------------------------------------------------------------
// Writable EVM adapter — extends EvmAdapter with transaction support
// ---------------------------------------------------------------------------

import { createWalletClient, http, type WalletClient, type Chain, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, polygon, arbitrum, optimism, base, bsc, avalanche } from 'viem/chains';
import type { WritableChainAdapter, TransactionRequest, TransactionReceipt } from '../types.js';
import { EvmAdapter } from './adapter.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('writable-evm');

const CHAIN_MAP: Record<string, Chain> = {
  ethereum: mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  bsc,
  avalanche,
};

export class WritableEvmAdapter extends EvmAdapter implements WritableChainAdapter {
  private walletClient: WalletClient | null = null;
  private privateKey: `0x${string}` | null = null;

  setPrivateKey(key: string): void {
    this.privateKey = (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
  }

  override async connect(rpcUrl?: string, explorerApiKey?: string): Promise<void> {
    await super.connect(rpcUrl, explorerApiKey);
    if (this.privateKey) {
      const chain = CHAIN_MAP[this.chainId];
      if (!chain) throw new Error(`Unsupported chain for writing: ${this.chainId}`);
      const account = privateKeyToAccount(this.privateKey);
      this.walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
      });
      log.info(`Wallet connected: ${account.address} on ${this.chainId}`);
    }
  }

  private requireWallet(): WalletClient {
    if (!this.walletClient) throw new Error('Wallet not connected. Call setPrivateKey() first.');
    return this.walletClient;
  }

  private getPublicClient(): PublicClient {
    // Access the parent's public client via the internal getter
    if (!this.isConnected()) throw new Error('Adapter not connected');
    // EvmAdapter stores client as protected — we use readContract as proxy
    return (this as unknown as { client: PublicClient }).client;
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionReceipt> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new Error('Wallet account not set');
    const hash = await wallet.sendTransaction({
      account,
      to: tx.to as `0x${string}`,
      value: tx.value,
      data: tx.data as `0x${string}` | undefined,
      gas: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      chain: wallet.chain,
    });
    log.info(`Transaction sent: ${hash}`);

    // Wait for receipt
    const publicClient = this.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      hash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      logs: receipt.logs.map((l) => ({
        address: l.address,
        topics: [...l.topics],
        data: l.data,
      })),
    };
  }

  async writeContract(
    address: string,
    abi: readonly unknown[],
    functionName: string,
    args: unknown[] = [],
    value?: bigint,
  ): Promise<TransactionReceipt> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new Error('Wallet account not set');
    const hash = await wallet.writeContract({
      account,
      address: address as `0x${string}`,
      abi: abi as readonly unknown[],
      functionName,
      args,
      chain: wallet.chain,
      ...(value !== undefined ? { value } : {}),
    } as Parameters<typeof wallet.writeContract>[0]);
    log.info(`Contract write: ${functionName} on ${address} → ${hash}`);

    const publicClient = this.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return {
      hash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 'success' ? 'success' : 'reverted',
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      logs: receipt.logs.map((l) => ({
        address: l.address,
        topics: [...l.topics],
        data: l.data,
      })),
    };
  }

  async signMessage(message: string): Promise<string> {
    const wallet = this.requireWallet();
    const account = wallet.account;
    if (!account) throw new Error('Wallet account not set');
    return wallet.signMessage({ account, message });
  }

  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    const publicClient = this.getPublicClient();
    return publicClient.estimateGas({
      to: tx.to as `0x${string}`,
      value: tx.value,
      data: tx.data as `0x${string}` | undefined,
    });
  }
}
