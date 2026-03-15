'use client';

const CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color';
const FALLBACK = `${CDN}/generic.svg`;

/** Map chain IDs and alternative names to icon file names */
const ALIASES: Record<string, string> = {
  // Chain IDs → native token
  ethereum: 'eth',
  bsc: 'bnb',
  polygon: 'matic',
  avalanche: 'avax',
  arbitrum: 'eth',
  optimism: 'eth',
  base: 'eth',
  fantom: 'ftm',
  cronos: 'cro',
  // Common alternative names
  bitcoin: 'btc',
  solana: 'sol',
  tether: 'usdt',
  'usd-coin': 'usdc',
  weth: 'eth',
  wbtc: 'btc',
  // Tokens without icons → fallback
  sui: 'generic',
  aptos: 'generic',
  ton: 'generic',
  multi: 'generic',
};

export function CryptoIcon({
  symbol,
  size = 16,
  className = '',
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const key = symbol.toLowerCase();
  const resolved = ALIASES[key] ?? key;

  return (
    <img
      src={`${CDN}/${resolved}.svg`}
      alt={symbol}
      width={size}
      height={size}
      className={`inline-block shrink-0 rounded-full ${className}`}
      onError={(e) => {
        (e.target as HTMLImageElement).src = FALLBACK;
      }}
    />
  );
}
