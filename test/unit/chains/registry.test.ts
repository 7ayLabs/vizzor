import { describe, it, expect } from 'vitest';
import { getAdapter, getSupportedChains } from '@/chains/registry.js';

describe('chain registry', () => {
  it('returns an adapter for ethereum', () => {
    const adapter = getAdapter('ethereum');
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('Ethereum');
  });

  it('returns an adapter for polygon', () => {
    const adapter = getAdapter('polygon');
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('Polygon');
  });

  it('returns an adapter for arbitrum', () => {
    const adapter = getAdapter('arbitrum');
    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('Arbitrum One');
  });

  it('returns an adapter for optimism', () => {
    const adapter = getAdapter('optimism');
    expect(adapter).toBeDefined();
  });

  it('returns an adapter for base', () => {
    const adapter = getAdapter('base');
    expect(adapter).toBeDefined();
  });

  it('throws for unknown chain', () => {
    expect(() => getAdapter('unknown-chain')).toThrow();
  });

  it('lists all supported chains', () => {
    const chains = getSupportedChains();
    expect(chains).toContain('ethereum');
    expect(chains).toContain('polygon');
    expect(chains).toContain('arbitrum');
    expect(chains.length).toBeGreaterThanOrEqual(5);
  });
});
