import { describe, it, expect } from 'vitest';
import { formatAddress, formatNumber, formatCurrency, formatPercentage } from '@/utils/format.js';

describe('formatAddress', () => {
  it('truncates long addresses', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    const result = formatAddress(addr);
    expect(result).toMatch(/^0x1234\.\.\.5678$/);
    expect(result.length).toBeLessThan(addr.length);
  });

  it('returns short strings as-is', () => {
    expect(formatAddress('0x1234')).toBe('0x1234');
  });
});

describe('formatNumber', () => {
  it('formats integers', () => {
    expect(formatNumber(1000)).toMatch(/1.*000/);
  });

  it('formats decimals', () => {
    const result = formatNumber(1234.5678);
    expect(result).toContain('1');
    expect(result).toContain('234');
  });
});

describe('formatCurrency', () => {
  it('formats with dollar sign', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('$');
    expect(result).toContain('1');
  });
});

describe('formatPercentage', () => {
  it('formats positive percentages', () => {
    const result = formatPercentage(12.345);
    expect(result).toContain('12');
    expect(result).toContain('%');
  });

  it('formats negative percentages', () => {
    const result = formatPercentage(-5.5);
    expect(result).toContain('-');
    expect(result).toContain('5');
    expect(result).toContain('%');
  });
});
