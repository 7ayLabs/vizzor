// ---------------------------------------------------------------------------
// Sanitization utilities for AI prompt injection defense
// ---------------------------------------------------------------------------

/**
 * Patterns that could be used for prompt injection via external data
 * (token names, news headlines, project descriptions, etc.)
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /ignore\s+(all\s+)?above/gi,
  /you\s+are\s+now/gi,
  /system\s*:/gi,
  /assistant\s*:/gi,
  /\[system\]/gi,
  /\[instruction\]/gi,
  /<\/?system>/gi,
  /repeat\s+(everything|the\s+prompt|your\s+instructions)/gi,
  /reveal\s+(your|the)\s+(prompt|instructions|config)/gi,
  /forget\s+(everything|your\s+instructions)/gi,
  /override\s+(previous|your|all)/gi,
  /new\s+instructions?\s*:/gi,
  /\bdo\s+not\s+follow\b/gi,
  /\bact\s+as\b/gi,
  /\brole\s*:\s*(system|assistant)\b/gi,
];

/**
 * Maximum lengths for external data fields to prevent abuse.
 */
const LIMITS = {
  tokenName: 60,
  headline: 250,
  description: 500,
  generic: 1000,
} as const;

/**
 * Sanitize external data before injecting into AI prompts.
 * Strips injection patterns and truncates to safe lengths.
 */
export function sanitizeExternalData(text: string, maxLen: number = LIMITS.generic): string {
  let cleaned = text;

  // Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[FILTERED]');
  }

  // Strip markdown headers that could trick model
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');

  // Strip code fences
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '[CODE]');

  // Truncate
  if (cleaned.length > maxLen) {
    cleaned = cleaned.slice(0, maxLen) + '...';
  }

  return cleaned;
}

/**
 * Sanitize a token name from external APIs (DEX, CoinGecko, etc.)
 */
export function sanitizeTokenName(name: string): string {
  return sanitizeExternalData(name, LIMITS.tokenName);
}

/**
 * Sanitize a news headline from CryptoPanic or similar.
 */
export function sanitizeHeadline(headline: string): string {
  return sanitizeExternalData(headline, LIMITS.headline);
}

/**
 * Wrap a block of external data with untrusted markers.
 * This tells the AI model to treat the content as data, not instructions.
 */
export function wrapUntrustedData(label: string, data: string): string {
  return `[BEGIN EXTERNAL DATA: ${label}]\n${data}\n[END EXTERNAL DATA: ${label}]`;
}

/**
 * Sanitize tool results before returning to AI in the agentic loop.
 * Recursively sanitizes string values in objects/arrays.
 */
export function sanitizeToolResult(result: unknown): unknown {
  if (typeof result === 'string') {
    return sanitizeExternalData(result);
  }
  if (Array.isArray(result)) {
    return result.map(sanitizeToolResult);
  }
  if (result !== null && typeof result === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
      sanitized[key] = sanitizeToolResult(value);
    }
    return sanitized;
  }
  return result;
}
