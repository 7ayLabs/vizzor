// ---------------------------------------------------------------------------
// ZK Chain Adapter — adapter for ZK rollup chains (zkSync, StarkNet, etc.)
// Uses EVM adapter under the hood for EVM-compatible ZK rollups
// ---------------------------------------------------------------------------

import { EvmAdapter } from '../evm/adapter.js';

// ---------------------------------------------------------------------------
// ZK-specific chain configurations
// ---------------------------------------------------------------------------

const ZK_CHAIN_CONFIG: Record<
  string,
  {
    name: string;
    rpcUrl: string;
    explorerApi: string;
    nativeCurrency: { symbol: string; decimals: number };
    isEvm: boolean;
  }
> = {
  zksync: {
    name: 'zkSync Era',
    rpcUrl: 'https://mainnet.era.zksync.io',
    explorerApi: 'https://block-explorer-api.mainnet.zksync.io/api',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    isEvm: true,
  },
  'polygon-zkevm': {
    name: 'Polygon zkEVM',
    rpcUrl: 'https://zkevm-rpc.com',
    explorerApi: 'https://api-zkevm.polygonscan.com/api',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    isEvm: true,
  },
  scroll: {
    name: 'Scroll',
    rpcUrl: 'https://rpc.scroll.io',
    explorerApi: 'https://api.scrollscan.com/api',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    isEvm: true,
  },
  linea: {
    name: 'Linea',
    rpcUrl: 'https://rpc.linea.build',
    explorerApi: 'https://api.lineascan.build/api',
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    isEvm: true,
  },
};

export class ZkEvmAdapter extends EvmAdapter {
  readonly zkType: string;
  private readonly zkName: string;

  constructor(chainId: string) {
    super(chainId);
    this.zkType = chainId;
    this.zkName = ZK_CHAIN_CONFIG[chainId]?.name ?? `ZK-${chainId}`;
  }

  getZkName(): string {
    return this.zkName;
  }

  getDefaultRpcUrl(): string {
    return ZK_CHAIN_CONFIG[this.chainId]?.rpcUrl ?? '';
  }
}

export function getZkChainIds(): string[] {
  return Object.keys(ZK_CHAIN_CONFIG);
}

export function isZkChain(chainId: string): boolean {
  return chainId in ZK_CHAIN_CONFIG;
}
