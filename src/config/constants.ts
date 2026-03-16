// ---------------------------------------------------------------------------
// Shared configuration constants
// ---------------------------------------------------------------------------

/** Default blockchain when none is specified. */
export const DEFAULT_CHAIN = 'ethereum';

/** @deprecated Used only by CLI trends fallback. TUI uses dynamic trending data. */
export const TREND_SYMBOLS = ['bitcoin', 'ethereum', 'solana'];

/** Default ticker symbols shown in the price bar. */
export const TICKER_DEFAULTS: { geckoId: string; symbol: string }[] = [
  { geckoId: 'bitcoin', symbol: 'BTC' },
  { geckoId: 'ethereum', symbol: 'ETH' },
  { geckoId: 'solana', symbol: 'SOL' },
];

/** Chain metadata for display and selection. */
export interface ChainMeta {
  id: string;
  name: string;
  icon: string;
  nativeSymbol: string;
  explorerUrl: string;
  explorerApiUrl: string;
  color: string;
}

export const CHAIN_REGISTRY: ChainMeta[] = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    icon: '\u{039E}', // Greek Xi (ETH symbol)
    nativeSymbol: 'ETH',
    explorerUrl: 'https://etherscan.io',
    explorerApiUrl: 'https://api.etherscan.io/api',
    color: '#627EEA',
  },
  {
    id: 'polygon',
    name: 'Polygon',
    icon: '\u{2B23}', // Hexagonal shape
    nativeSymbol: 'POL',
    explorerUrl: 'https://polygonscan.com',
    explorerApiUrl: 'https://api.polygonscan.com/api',
    color: '#8247E5',
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    icon: '\u{25C6}', // Diamond
    nativeSymbol: 'ETH',
    explorerUrl: 'https://arbiscan.io',
    explorerApiUrl: 'https://api.arbiscan.io/api',
    color: '#28A0F0',
  },
  {
    id: 'optimism',
    name: 'Optimism',
    icon: '\u{25CF}', // Filled circle
    nativeSymbol: 'ETH',
    explorerUrl: 'https://optimistic.etherscan.io',
    explorerApiUrl: 'https://api-optimistic.etherscan.io/api',
    color: '#FF0420',
  },
  {
    id: 'base',
    name: 'Base',
    icon: '\u{25B3}', // Triangle up
    nativeSymbol: 'ETH',
    explorerUrl: 'https://basescan.org',
    explorerApiUrl: 'https://api.basescan.org/api',
    color: '#0052FF',
  },
];

/** Quick lookup: chain ID -> explorer API URL (backwards compatible). */
export const ETHERSCAN_BASE_URLS: Record<string, string> = Object.fromEntries(
  CHAIN_REGISTRY.map((c) => [c.id, c.explorerApiUrl]),
);

/** Quick lookup: chain ID -> chain metadata. */
export function getChainMeta(chainId: string): ChainMeta | undefined {
  return CHAIN_REGISTRY.find((c) => c.id === chainId);
}

/** Map of common token symbols to CoinGecko IDs. */
export const KNOWN_SYMBOLS: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  bnb: 'binancecoin',
  bsc: 'binancecoin',
  xrp: 'ripple',
  ripple: 'ripple',
  ada: 'cardano',
  cardano: 'cardano',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  dot: 'polkadot',
  polkadot: 'polkadot',
  avax: 'avalanche-2',
  avalanche: 'avalanche-2',
  matic: 'matic-network',
  polygon: 'matic-network',
  link: 'chainlink',
  chainlink: 'chainlink',
  uni: 'uniswap',
  uniswap: 'uniswap',
  atom: 'cosmos',
  cosmos: 'cosmos',
  near: 'near',
  arb: 'arbitrum',
  op: 'optimism',
  sui: 'sui',
  apt: 'aptos',
  pepe: 'pepe',
  shib: 'shiba-inu',
  floki: 'floki',
  bonk: 'bonk',
  wif: 'dogwifcoin',
};
