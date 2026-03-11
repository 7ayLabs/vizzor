// ---------------------------------------------------------------------------
// Shared configuration constants
// ---------------------------------------------------------------------------

/** Default blockchain when none is specified. */
export const DEFAULT_CHAIN = 'ethereum';

/** Default symbols for the /trends command. */
export const TREND_SYMBOLS = ['bitcoin', 'ethereum', 'solana'];

/** Etherscan-compatible explorer API base URLs per chain. */
export const ETHERSCAN_BASE_URLS: Record<string, string> = {
  ethereum: 'https://api.etherscan.io/api',
  polygon: 'https://api.polygonscan.com/api',
  arbitrum: 'https://api.arbiscan.io/api',
  optimism: 'https://api-optimistic.etherscan.io/api',
  base: 'https://api.basescan.org/api',
};
