'use client';

import { useState } from 'react';

const CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color';

/** Map chain IDs, alternative names, and missing tokens */
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
};

/** Symbols known to be missing from cryptocurrency-icons@0.18.1 */
// prettier-ignore
const MISSING = new Set([
  'sui', 'apt', 'ton', 'tia', 'sei', 'inj', 'arb', 'op', 'imx', 'render',
  'fet', 'stx', 'kas', 'okb', 'ftm', 'rune', 'axs', 'flow', 'kava', 'iota',
  'egld', 'xec', 'mina', 'celo', 'rsr', 'celr', 'flr', 'jasmy', 'pepe',
  'wif', 'bonk', 'floki', 'wld', 'jup', 'multi', 'near', 'hbar', 'leo',
]);

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
  const [failed, setFailed] = useState(() => MISSING.has(resolved));

  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 rounded-full bg-[var(--border)] text-[var(--muted)] font-bold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`${CDN}/${resolved}.svg`}
      alt={symbol}
      width={size}
      height={size}
      className={`inline-block shrink-0 rounded-full ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
