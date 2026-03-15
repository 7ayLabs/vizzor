import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TonAdapter } from '@/chains/ton/adapter.js';

// ---------------------------------------------------------------------------
// Mock fetch globally so tests don't hit real API
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockApi(result: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ ok: true, result }),
  });
}

let adapter: TonAdapter;

beforeEach(() => {
  mockFetch.mockReset();
  adapter = new TonAdapter();
});

// ---------------------------------------------------------------------------
// TonAdapter
// ---------------------------------------------------------------------------

describe('TonAdapter', () => {
  // -------------------------------------------------------------------------
  // Static properties
  // -------------------------------------------------------------------------

  it('has correct chainId, name, and nativeCurrency', () => {
    expect(adapter.chainId).toBe('ton');
    expect(adapter.name).toBe('TON');
    expect(adapter.nativeCurrency.symbol).toBe('TON');
  });

  // -------------------------------------------------------------------------
  // connect / disconnect
  // -------------------------------------------------------------------------

  it('connect sets connected state', async () => {
    expect(adapter.isConnected()).toBe(false);
    await adapter.connect();
    expect(adapter.isConnected()).toBe(true);
  });

  it('disconnect sets disconnected state', async () => {
    await adapter.connect();
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // getBalance
  // -------------------------------------------------------------------------

  it('getBalance returns nanoton as bigint', async () => {
    mockApi('5000000000');

    const balance = await adapter.getBalance('EQDtFpEwcFAEcRe5mL...');
    expect(balance).toBe(5000000000n);

    // Verify getAddressBalance was called with the address
    expect(mockFetch.mock.calls[0]![0]).toContain('getAddressBalance');
    expect(mockFetch.mock.calls[0]![0]).toContain('address=');
  });

  // -------------------------------------------------------------------------
  // getTransactionHistory
  // -------------------------------------------------------------------------

  it('getTransactionHistory maps transactions', async () => {
    mockApi([
      {
        transaction_id: { hash: 'txhash1' },
        utime: 1700000000,
        in_msg: { value: '1000000000', source: 'EQSrc1', destination: 'EQDst1' },
        out_msgs: [],
        fee: '5000',
      },
      {
        transaction_id: { hash: 'txhash2' },
        utime: 1700001000,
        in_msg: { value: '2000000000', source: 'EQSrc2', destination: 'EQDst2' },
        out_msgs: [],
        fee: '6000',
      },
    ]);

    const txs = await adapter.getTransactionHistory('EQAddr');
    expect(txs).toHaveLength(2);

    expect(txs[0]!.hash).toBe('txhash1');
    expect(txs[0]!.from).toBe('EQSrc1');
    expect(txs[0]!.to).toBe('EQDst1');
    expect(txs[0]!.value).toBe(1000000000n);
    expect(txs[0]!.gasUsed).toBe(5000n);
    expect(txs[0]!.timestamp).toBe(1700000000);
    expect(txs[0]!.status).toBe('success');

    expect(txs[1]!.hash).toBe('txhash2');
    expect(txs[1]!.value).toBe(2000000000n);
    expect(txs[1]!.gasUsed).toBe(6000n);
  });

  // -------------------------------------------------------------------------
  // getBlockNumber
  // -------------------------------------------------------------------------

  it('getBlockNumber returns masterchain seqno', async () => {
    mockApi({ last: { seqno: 38000000 } });

    const blockNum = await adapter.getBlockNumber();
    expect(blockNum).toBe(38000000n);

    expect(mockFetch.mock.calls[0]![0]).toContain('getMasterchainInfo');
  });

  // -------------------------------------------------------------------------
  // readContract
  // -------------------------------------------------------------------------

  it('readContract throws with not supported message', async () => {
    await expect(adapter.readContract('addr', [], 'fn')).rejects.toThrow('not supported');
  });
});
