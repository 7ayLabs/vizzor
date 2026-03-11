/**
 * Truncates an Ethereum-style address to the form 0x1234...abcd.
 */
export function formatAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Formats a number with locale-aware thousand separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Formats a number as currency with the given symbol prefix.
 */
export function formatCurrency(n: number, symbol = '$'): string {
  return `${symbol}${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats a number as a percentage with two decimal places.
 */
export function formatPercentage(n: number): string {
  return `${n.toFixed(2)}%`;
}

/**
 * Converts a Unix timestamp (seconds) to a human-readable date string.
 */
export function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
