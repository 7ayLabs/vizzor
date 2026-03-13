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
 * Masks an API key for safe display using zero-knowledge style masking.
 * Shows only the first 2 and last 2 characters with asterisks in between.
 * This prevents leaking key prefixes that could be used for phishing or
 * identifying the key provider/format.
 */
export function maskKey(value: string | undefined): string {
  if (!value) {
    return '<not set>';
  }
  if (value.length <= 4) {
    return '****';
  }
  if (value.length <= 8) {
    return value.slice(0, 1) + '****' + value.slice(-1);
  }
  return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 4, 12)) + value.slice(-2);
}

// ---------------------------------------------------------------------------
// Key validation — reject phishing, scam, and malformed keys
// ---------------------------------------------------------------------------

/** Known key prefix patterns for supported providers. */
const KEY_PATTERNS: Record<string, RegExp> = {
  anthropicApiKey: /^sk-ant-[a-zA-Z0-9_-]{20,}$/,
  openaiApiKey: /^sk-[a-zA-Z0-9_-]{20,}$/,
  googleApiKey: /^AI[a-zA-Z0-9_-]{20,}$/,
  etherscanApiKey: /^[A-Z0-9]{20,}$/,
  alchemyApiKey: /^[a-zA-Z0-9_-]{20,}$/,
  coingeckoApiKey: /^CG-[a-zA-Z0-9]{10,}$/,
  cryptopanicApiKey: /^[a-f0-9]{20,}$/,
};

/** Characters that should never appear in a legitimate API key. */
const FORBIDDEN_CHARS = /[<>{}()|\\;`$!"'&\s]/;

/** Patterns indicating phishing or injection attempts. */
const PHISHING_PATTERNS = [
  /https?:\/\//i,
  /javascript:/i,
  /data:/i,
  /<script/i,
  /eval\s*\(/i,
  /\.\.\//,
  /\/etc\//,
  /\$\{/,
  /`.*`/,
];

/**
 * Validates an API key value for a given config key.
 * Returns null if valid, or an error message if rejected.
 */
export function validateKey(keyName: string, value: string): string | null {
  if (!value || value.trim().length === 0) {
    return 'Key value cannot be empty.';
  }

  // Check for forbidden characters (injection / phishing)
  if (FORBIDDEN_CHARS.test(value)) {
    return 'Key contains invalid characters. API keys only use alphanumeric characters, hyphens, and underscores.';
  }

  // Check for phishing / injection patterns
  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(value)) {
      return 'Key rejected: value looks like a URL, script, or injection attempt.';
    }
  }

  // Length sanity check
  if (value.length > 256) {
    return 'Key rejected: value is too long (max 256 characters).';
  }

  // Provider-specific format validation (warn, don't block)
  const expectedPattern = KEY_PATTERNS[keyName];
  if (expectedPattern && !expectedPattern.test(value)) {
    return `Warning: key format doesn't match expected pattern for ${keyName}. Double-check the value.`;
  }

  return null;
}
