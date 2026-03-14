// ---------------------------------------------------------------------------
// Input validation utilities
// ---------------------------------------------------------------------------

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SYMBOL_RE = /^[A-Za-z0-9]{1,20}$/;

/**
 * Validate an EVM address format. Throws if invalid.
 */
export function assertValidAddress(address: string): void {
  if (!EVM_ADDRESS_RE.test(address)) {
    throw new Error(`Invalid address format: expected 0x followed by 40 hex characters`);
  }
}

/**
 * Check if a string is a valid EVM address.
 */
export function isValidAddress(address: string): boolean {
  return EVM_ADDRESS_RE.test(address);
}

/**
 * Validate a token/coin symbol. Throws if invalid.
 */
export function assertValidSymbol(symbol: string): void {
  if (!SYMBOL_RE.test(symbol)) {
    throw new Error(`Invalid symbol format: expected 1-20 alphanumeric characters`);
  }
}

/**
 * Check if a string is a valid symbol.
 */
export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol);
}
