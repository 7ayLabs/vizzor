import { describe, it, expect } from 'vitest';
import { hasKey, maskKey, requireKey } from '@/config/keys.js';

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
  it('masks a long key showing first 6 chars', () => {
    const result = maskKey('sk-ant-api03-abcdef123456');
    expect(result).toBe('sk-ant...');
  });

  it('returns short keys as-is', () => {
    const result = maskKey('short');
    expect(result).toBe('short');
  });

  it('returns placeholder for undefined', () => {
    const result = maskKey(undefined);
    expect(result).toBe('<not set>');
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
