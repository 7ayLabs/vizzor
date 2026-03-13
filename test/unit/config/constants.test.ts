import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHAIN,
  TREND_SYMBOLS,
  TICKER_DEFAULTS,
  CHAIN_REGISTRY,
  ETHERSCAN_BASE_URLS,
  KNOWN_SYMBOLS,
  getChainMeta,
} from '@/config/constants.js';

describe('constants', () => {
  describe('DEFAULT_CHAIN', () => {
    it('defaults to ethereum', () => {
      expect(DEFAULT_CHAIN).toBe('ethereum');
    });
  });

  describe('TREND_SYMBOLS', () => {
    it('contains the big 3', () => {
      expect(TREND_SYMBOLS).toContain('bitcoin');
      expect(TREND_SYMBOLS).toContain('ethereum');
      expect(TREND_SYMBOLS).toContain('solana');
    });
  });

  describe('TICKER_DEFAULTS', () => {
    it('has BTC, ETH, SOL with correct geckoIds', () => {
      expect(TICKER_DEFAULTS).toHaveLength(3);
      expect(TICKER_DEFAULTS[0]!.symbol).toBe('BTC');
      expect(TICKER_DEFAULTS[0]!.geckoId).toBe('bitcoin');
      expect(TICKER_DEFAULTS[1]!.symbol).toBe('ETH');
      expect(TICKER_DEFAULTS[2]!.symbol).toBe('SOL');
    });
  });

  describe('CHAIN_REGISTRY', () => {
    it('contains all 5 EVM chains', () => {
      const ids = CHAIN_REGISTRY.map((c) => c.id);
      expect(ids).toContain('ethereum');
      expect(ids).toContain('polygon');
      expect(ids).toContain('arbitrum');
      expect(ids).toContain('optimism');
      expect(ids).toContain('base');
    });

    it('each chain has required metadata', () => {
      for (const chain of CHAIN_REGISTRY) {
        expect(chain.id).toBeTruthy();
        expect(chain.name).toBeTruthy();
        expect(chain.icon).toBeTruthy();
        expect(chain.nativeSymbol).toBeTruthy();
        expect(chain.explorerUrl).toMatch(/^https:\/\//);
        expect(chain.explorerApiUrl).toMatch(/^https:\/\//);
        expect(chain.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it('has unique chain IDs', () => {
      const ids = CHAIN_REGISTRY.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('ETHERSCAN_BASE_URLS', () => {
    it('is derived from CHAIN_REGISTRY', () => {
      for (const chain of CHAIN_REGISTRY) {
        expect(ETHERSCAN_BASE_URLS[chain.id]).toBe(chain.explorerApiUrl);
      }
    });

    it('has entries for all chains', () => {
      expect(Object.keys(ETHERSCAN_BASE_URLS).length).toBe(CHAIN_REGISTRY.length);
    });
  });

  describe('KNOWN_SYMBOLS', () => {
    it('maps btc to bitcoin', () => {
      expect(KNOWN_SYMBOLS['btc']).toBe('bitcoin');
    });

    it('maps eth to ethereum', () => {
      expect(KNOWN_SYMBOLS['eth']).toBe('ethereum');
    });

    it('maps sol to solana', () => {
      expect(KNOWN_SYMBOLS['sol']).toBe('solana');
    });

    it('maps full names as well', () => {
      expect(KNOWN_SYMBOLS['bitcoin']).toBe('bitcoin');
      expect(KNOWN_SYMBOLS['ethereum']).toBe('ethereum');
    });

    it('contains common DeFi tokens', () => {
      expect(KNOWN_SYMBOLS['uni']).toBe('uniswap');
      expect(KNOWN_SYMBOLS['link']).toBe('chainlink');
      expect(KNOWN_SYMBOLS['avax']).toBe('avalanche-2');
    });

    it('contains meme tokens', () => {
      expect(KNOWN_SYMBOLS['doge']).toBe('dogecoin');
      expect(KNOWN_SYMBOLS['shib']).toBe('shiba-inu');
      expect(KNOWN_SYMBOLS['pepe']).toBe('pepe');
    });
  });

  describe('getChainMeta', () => {
    it('returns metadata for known chains', () => {
      const eth = getChainMeta('ethereum');
      expect(eth).toBeDefined();
      expect(eth!.name).toBe('Ethereum');
      expect(eth!.icon).toBeTruthy();
    });

    it('returns undefined for unknown chains', () => {
      expect(getChainMeta('nonexistent')).toBeUndefined();
    });
  });
});
