// ---------------------------------------------------------------------------
// Chain adapter registry – factory-based creation of ChainAdapter instances
// ---------------------------------------------------------------------------

import type { ChainAdapter, WritableChainAdapter } from './types.js';
import { EvmAdapter } from './evm/adapter.js';
import { WritableEvmAdapter } from './evm/writable-adapter.js';
import { ZkEvmAdapter, getZkChainIds } from './zk/adapter.js';
import { SolanaAdapter } from './solana/adapter.js';
import { SuiAdapter } from './sui/adapter.js';
import { AptosAdapter } from './aptos/adapter.js';
import { TonAdapter } from './ton/adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A factory that produces a ChainAdapter for a given chain ID. */
export type ChainAdapterFactory = (chainId: string) => ChainAdapter;

// ---------------------------------------------------------------------------
// Internal registry map
// ---------------------------------------------------------------------------

const registry = new Map<string, ChainAdapterFactory>();

// ---------------------------------------------------------------------------
// Built-in EVM adapters
// ---------------------------------------------------------------------------

const evmFactory: ChainAdapterFactory = (chainId) => new EvmAdapter(chainId);

const BUILTIN_EVM_CHAINS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'] as const;

for (const chainId of BUILTIN_EVM_CHAINS) {
  registry.set(chainId, evmFactory);
}

// ZK rollup chains (EVM-compatible)
const zkFactory: ChainAdapterFactory = (chainId) => new ZkEvmAdapter(chainId);

for (const chainId of getZkChainIds()) {
  registry.set(chainId, zkFactory);
}

// Additional EVM-compatible chains
registry.set('bsc', evmFactory);
registry.set('avalanche', evmFactory);

// Non-EVM chain adapters
registry.set('solana', () => new SolanaAdapter());
registry.set('sui', () => new SuiAdapter());
registry.set('aptos', () => new AptosAdapter());
registry.set('ton', () => new TonAdapter());

// ---------------------------------------------------------------------------
// Writable EVM adapter factory
// ---------------------------------------------------------------------------

const writableEvmFactory: ChainAdapterFactory = (chainId) => new WritableEvmAdapter(chainId);

export function getWritableAdapter(chainId: string): WritableChainAdapter {
  const adapter = writableEvmFactory(chainId);
  return adapter as WritableChainAdapter;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create (or retrieve) a {@link ChainAdapter} for the given chain ID.
 *
 * Each call produces a **new** adapter instance; callers are responsible for
 * caching if they need to reuse across requests.
 */
export function getAdapter(chainId: string): ChainAdapter {
  const factory = registry.get(chainId);
  if (!factory) {
    throw new Error(
      `No adapter registered for chain "${chainId}". ` +
        `Supported chains: ${getSupportedChains().join(', ')}`,
    );
  }
  return factory(chainId);
}

/**
 * Register a custom adapter factory for a chain ID.
 *
 * This allows third-party or non-EVM chains to plug into Vizzor.
 */
export function registerAdapter(chainId: string, factory: ChainAdapterFactory): void {
  registry.set(chainId, factory);
}

/**
 * Return the list of chain IDs that have registered adapter factories.
 */
export function getSupportedChains(): string[] {
  return [...registry.keys()];
}
