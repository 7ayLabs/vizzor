// ---------------------------------------------------------------------------
// Sanitization utilities for AI prompt injection defense
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { randomBytes } from 'node:crypto';

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
  // Unicode escape sequences that spell injection keywords
  /\\u0073\\u0079\\u0073\\u0074\\u0065\\u006d/gi, // "system"
  /\\u0069\\u006e\\u0073\\u0074\\u0072\\u0075\\u0063\\u0074/gi, // "instruct"
  /\\u0069\\u0067\\u006e\\u006f\\u0072\\u0065/gi, // "ignore"
  // Base64-encoded instruction patterns (common payloads)
  /[A-Za-z0-9+/]{20,}={0,2}/g, // Handled via decodeBase64Segments below
  // HTML entity bypass patterns
  /&#\d{2,4};/g, // Numeric HTML entities like &#115;
  /&#x[0-9a-fA-F]{2,4};/g, // Hex HTML entities like &#x73;
];

// Unicode escape sequences that decode to injection keywords
const UNICODE_ESCAPE_RE = /\\u[0-9a-fA-F]{4}/g;

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
 * Decode unicode escape sequences (e.g., \u0073 -> 's') for pattern checking.
 */
export function decodeUnicodeEscapes(text: string): string {
  return text.replace(UNICODE_ESCAPE_RE, (match) => {
    const codePoint = parseInt(match.slice(2), 16);
    return String.fromCharCode(codePoint);
  });
}

/**
 * Decode HTML numeric entities (&#NNN; and &#xHH;) for pattern checking.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, digits: string) => {
      const code = parseInt(digits, 10);
      return code > 0 && code < 0x10ffff ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code < 0x10ffff ? String.fromCharCode(code) : '';
    });
}

/**
 * Detect and decode base64 segments in text for pattern checking.
 * Only decodes segments that are >= 20 chars and valid base64.
 */
export function decodeBase64Segments(text: string): string {
  const base64Re = /[A-Za-z0-9+/]{20,}={0,2}/g;
  return text.replace(base64Re, (match) => {
    try {
      const decoded = Buffer.from(match, 'base64').toString('utf8');
      // Only accept if the decoded text is mostly printable ASCII
      const printableRatio =
        decoded.split('').filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).length /
        decoded.length;
      return printableRatio > 0.8 ? decoded : match;
    } catch {
      return match;
    }
  });
}

/**
 * Sanitize external data before injecting into AI prompts.
 * Strips injection patterns and truncates to safe lengths.
 * Decodes unicode escapes, HTML entities, and base64 before pattern matching.
 */
export function sanitizeExternalData(text: string, maxLen: number = LIMITS.generic): string {
  let cleaned = text;

  // Phase 1: Strip injection patterns on raw text
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    cleaned = cleaned.replace(pattern, '[FILTERED]');
  }

  // Phase 2: Decode obfuscated representations and re-check
  const decodedUnicode = decodeUnicodeEscapes(cleaned);
  const decodedHtml = decodeHtmlEntities(cleaned);
  const decodedBase64 = decodeBase64Segments(cleaned);

  // If any decoded version triggers patterns, filter the original
  for (const decoded of [decodedUnicode, decodedHtml, decodedBase64]) {
    if (decoded !== cleaned) {
      for (const pattern of INJECTION_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(decoded)) {
          // The decoded version contains injection — replace in original
          cleaned = cleaned.replace(
            /\\u[0-9a-fA-F]{4}|&#\d{2,4};|&#x[0-9a-fA-F]{2,4};|[A-Za-z0-9+/]{20,}={0,2}/g,
            '[FILTERED]',
          );
          break;
        }
        pattern.lastIndex = 0;
      }
    }
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

// ---------------------------------------------------------------------------
// Zod schema validation for tool result shapes
// ---------------------------------------------------------------------------

const toolResultSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);

/**
 * Validate that a tool result conforms to an expected shape.
 * Returns true if the result is a valid tool result type.
 */
export function validateToolResultShape(result: unknown): boolean {
  return toolResultSchema.safeParse(result).success;
}

// ---------------------------------------------------------------------------
// Canary token injection
// ---------------------------------------------------------------------------

/**
 * Wraps prompt sections with invisible canary markers.
 * If the AI output contains canary tokens, it means the model leaked
 * internal framing, which indicates potential prompt injection success.
 */
export function injectCanaryTokens(prompt: string): string {
  const canary = randomBytes(8).toString('hex');
  const prefix = `<!-- CANARY:${canary}:BEGIN -->`;
  const suffix = `<!-- CANARY:${canary}:END -->`;
  return `${prefix}\n${prompt}\n${suffix}`;
}

/**
 * Check if AI output contains leaked canary tokens.
 * Returns true if canary markers are found in the output.
 */
export function detectCanaryLeak(output: string): boolean {
  return /<!-- CANARY:[0-9a-f]{16}:(BEGIN|END) -->/.test(output);
}
