import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkTokenSecurity, checkAddressSecurity } from '@/data/sources/goplus.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Token Security
// ---------------------------------------------------------------------------

describe('checkTokenSecurity', () => {
  const SAFE_TOKEN = {
    is_open_source: '1',
    is_proxy: '0',
    is_mintable: '0',
    can_take_back_ownership: '0',
    owner_change_balance: '0',
    hidden_owner: '0',
    selfdestruct: '0',
    external_call: '0',
    is_honeypot: '0',
    buy_tax: '0',
    sell_tax: '0.03',
    cannot_buy: '0',
    cannot_sell_all: '0',
    slippage_modifiable: '0',
    is_blacklisted: '0',
    is_whitelisted: '0',
    anti_whale_modifiable: '0',
    trading_cooldown: '0',
    personal_slippage_modifiable: '0',
    holder_count: '15000',
    lp_holder_count: '50',
    total_supply: '1000000000',
    creator_address: '0xabc',
    creator_percent: '0.01',
    owner_address: '0xdef',
    owner_percent: '0',
    lp_total_supply_percent: '0.95',
    is_in_dex: '1',
    dex: [],
    trust_list: '1',
  };

  it('classifies a safe token correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 1,
        result: { '0x1234': SAFE_TOKEN },
      }),
    });

    const result = await checkTokenSecurity('0x1234', 'ethereum');
    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('safe');
    expect(result!.isHoneypot).toBe(false);
    expect(result!.isMintable).toBe(false);
    expect(result!.isOpenSource).toBe(true);
  });

  it('classifies a honeypot as danger', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 1,
        result: {
          '0xdead': {
            ...SAFE_TOKEN,
            is_honeypot: '1',
            sell_tax: '1.0',
          },
        },
      }),
    });

    const result = await checkTokenSecurity('0xdead', 'ethereum');
    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('danger');
    expect(result!.isHoneypot).toBe(true);
  });

  it('classifies mintable tokens as danger', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 1,
        result: {
          '0xmint': {
            ...SAFE_TOKEN,
            is_mintable: '1',
          },
        },
      }),
    });

    const result = await checkTokenSecurity('0xmint', 'ethereum');
    expect(result!.riskLevel).toBe('danger');
    expect(result!.isMintable).toBe(true);
  });

  it('classifies high sell tax as warning', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 1,
        result: {
          '0xtax': {
            ...SAFE_TOKEN,
            sell_tax: '0.15',
          },
        },
      }),
    });

    const result = await checkTokenSecurity('0xtax', 'ethereum');
    expect(result!.riskLevel).toBe('warning');
    expect(result!.sellTax).toBeGreaterThan(0.1);
  });

  it('returns null for invalid API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 0, result: {} }),
    });

    const result = await checkTokenSecurity('0xbad', 'ethereum');
    expect(result).toBeNull();
  });

  it('maps chain names to numeric IDs correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 1, result: { '0x1234': SAFE_TOKEN } }),
    });

    await checkTokenSecurity('0x1234', 'bsc');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/token_security/56'));
  });
});

// ---------------------------------------------------------------------------
// Address Security
// ---------------------------------------------------------------------------

describe('checkAddressSecurity', () => {
  it('detects malicious addresses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 1,
        result: {
          contract_address: '0',
          malicious_address: '1',
          honeypot_related_address: '1',
          phishing_activities: '0',
          blacklist_doubt: '0',
          data_source: ['GoPlus'],
        },
      }),
    });

    const result = await checkAddressSecurity('0xevil', 'ethereum');
    expect(result).not.toBeNull();
    expect(result!.maliciousAddress).toBe(true);
    expect(result!.honeypotRelated).toBe(true);
    expect(result!.phishing).toBe(false);
  });

  it('returns clean result for safe addresses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: 1,
        result: {
          contract_address: '0',
          malicious_address: '0',
          honeypot_related_address: '0',
          phishing_activities: '0',
          blacklist_doubt: '0',
          data_source: [],
        },
      }),
    });

    const result = await checkAddressSecurity('0xgood', 'ethereum');
    expect(result!.maliciousAddress).toBe(false);
    expect(result!.honeypotRelated).toBe(false);
  });
});
