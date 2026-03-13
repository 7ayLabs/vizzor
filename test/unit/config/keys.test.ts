import { describe, it, expect } from 'vitest';
import { hasKey, maskKey, requireKey, validateKey } from '@/config/keys.js';

describe('hasKey', () => {
  it('returns true for non-empty strings', () => {
    expect(hasKey('abc')).toBe(true);
  });

  it('returns false for undefined', () => {
    expect(hasKey(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasKey('')).toBe(false);
  });
});

describe('maskKey', () => {
  it('masks a long key showing first 2 and last 2 chars', () => {
    const result = maskKey('sk-ant-api03-abcdef123456');
    expect(result).toBe('sk************56');
  });

  it('masks short keys (<=4 chars) fully', () => {
    expect(maskKey('abcd')).toBe('****');
  });

  it('masks medium keys (5-8 chars) with first 1 and last 1', () => {
    expect(maskKey('short')).toBe('s****t');
  });

  it('returns placeholder for undefined', () => {
    expect(maskKey(undefined)).toBe('<not set>');
  });
});

describe('requireKey', () => {
  it('returns the value when key is present', () => {
    expect(requireKey('TEST_KEY', 'some-value')).toBe('some-value');
  });

  it('throws when key is undefined', () => {
    expect(() => requireKey('TEST_KEY', undefined)).toThrow('TEST_KEY');
  });

  it('throws when key is empty string', () => {
    expect(() => requireKey('TEST_KEY', '')).toThrow('TEST_KEY');
  });
});

describe('validateKey', () => {
  it('rejects empty values', () => {
    expect(validateKey('anthropicApiKey', '')).toBe('Key value cannot be empty.');
  });

  it('rejects keys with forbidden characters', () => {
    expect(validateKey('anthropicApiKey', 'key with spaces')).toMatch(/invalid characters/);
    expect(validateKey('anthropicApiKey', 'key<script>')).toMatch(/invalid characters/);
  });

  it('rejects phishing URLs', () => {
    expect(validateKey('anthropicApiKey', 'https://evil.com/key')).toMatch(/rejected/);
  });

  it('rejects injection attempts', () => {
    expect(validateKey('anthropicApiKey', '${process.env.SECRET}')).toMatch(/rejected|invalid/);
  });

  it('rejects keys longer than 256 chars', () => {
    expect(validateKey('anthropicApiKey', 'a'.repeat(257))).toMatch(/too long/);
  });

  it('returns null for valid keys', () => {
    expect(validateKey('alchemyApiKey', 'abc123-valid_key_that_is_long_enough')).toBeNull();
  });

  it('warns on format mismatch for known providers', () => {
    const result = validateKey('anthropicApiKey', 'not-matching-format-key');
    expect(result).toMatch(/Warning/);
  });
});
