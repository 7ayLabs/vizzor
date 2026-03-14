// ---------------------------------------------------------------------------
// Agent wallet — read-only for v0.3.0 (no tx signing)
// ---------------------------------------------------------------------------

import { createPublicClient, http, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import type { Address } from 'viem';

export interface AgentWallet {
  address: string;
  chain: string;
}

const client = createPublicClient({
  chain: mainnet,
  transport: http(),
});

/**
 * Read the ETH balance of a wallet address.
 * v0.3.0: read-only, no private key management or tx signing.
 */
export async function getWalletBalance(address: string): Promise<string> {
  const balance = await client.getBalance({ address: address as Address });
  return formatEther(balance);
}

/**
 * Check if an address is a valid Ethereum address format.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
