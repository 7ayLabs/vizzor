/**
 * Throws a descriptive error if the given API key value is undefined or empty.
 */
export function requireKey(keyName: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required API key: ${keyName}. ` +
        `Set it in ~/.vizzor/config.yaml or via the corresponding environment variable.`,
    );
  }
  return value;
}

/**
 * Returns true if the given value is a non-empty string.
 */
export function hasKey(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Masks an API key for safe display, showing only the first 6 characters.
 */
export function maskKey(value: string | undefined): string {
  if (!value) {
    return '<not set>';
  }
  if (value.length <= 6) {
    return value;
  }
  return `${value.slice(0, 6)}...`;
}
