import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuiAdapter } from '@/chains/sui/adapter.js';

// ---------------------------------------------------------------------------
// Mock fetch globally so tests don't hit real RPC
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockRpc(result: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
  });
}

let adapter: SuiAdapter;

beforeEach(() => {
  mockFetch.mockReset();
  adapter = new SuiAdapter();
});

// ---------------------------------------------------------------------------
// SuiAdapter
// ---------------------------------------------------------------------------

describe('SuiAdapter', () => {
  // -------------------------------------------------------------------------
  // Static properties
  // -------------------------------------------------------------------------

  it('has correct chainId, name, and nativeCurrency', () => {
    expect(adapter.chainId).toBe('sui');
    expect(adapter.name).toBe('Sui');
    expect(adapter.nativeCurrency.symbol).toBe('SUI');
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

  it('getBalance calls suix_getBalance and returns BigInt of totalBalance', async () => {
    mockRpc({ totalBalance: '2500000000' });

    const balance = await adapter.getBalance('0xSuiAddr');
    expect(balance).toBe(2500000000n);

    // Verify suix_getBalance was called with the SUI coin type
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.method).toBe('suix_getBalance');
    expect(body.params).toEqual(['0xSuiAddr', '0x2::sui::SUI']);
  });

  // -------------------------------------------------------------------------
  // getTokenBalance
  // -------------------------------------------------------------------------

  it('getTokenBalance calls suix_getBalance with token type', async () => {
    mockRpc({ totalBalance: '99000000' });

    const balance = await adapter.getTokenBalance('0xOwner', '0xTokenType');
    expect(balance).toBe(99000000n);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.method).toBe('suix_getBalance');
    expect(body.params).toEqual(['0xOwner', '0xTokenType']);
  });

  // -------------------------------------------------------------------------
  // getTransactionHistory
  // -------------------------------------------------------------------------

  it('getTransactionHistory maps digests to Transaction[]', async () => {
    mockRpc({
      data: [
        { digest: 'D1abc', timestampMs: '1700000000000', checkpoint: '5000' },
        { digest: 'D2def', timestampMs: '1700001000000', checkpoint: '5001' },
      ],
    });

    const txs = await adapter.getTransactionHistory('0xSuiAddr');
    expect(txs).toHaveLength(2);

    expect(txs[0]!.hash).toBe('D1abc');
    expect(txs[0]!.blockNumber).toBe(5000n);
    expect(txs[0]!.from).toBe('0xSuiAddr');
    expect(txs[0]!.timestamp).toBe(1700000000);
    expect(txs[0]!.status).toBe('success');

    expect(txs[1]!.hash).toBe('D2def');
    expect(txs[1]!.blockNumber).toBe(5001n);
  });

  // -------------------------------------------------------------------------
  // getBlockNumber
  // -------------------------------------------------------------------------

  it('getBlockNumber returns checkpoint sequence number', async () => {
    mockRpc('12345678');

    const blockNum = await adapter.getBlockNumber();
    expect(blockNum).toBe(12345678n);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.method).toBe('sui_getLatestCheckpointSequenceNumber');
  });

  // -------------------------------------------------------------------------
  // getTokenInfo
  // -------------------------------------------------------------------------

  it('getTokenInfo returns coin metadata', async () => {
    mockRpc({
      name: 'Test Coin',
      symbol: 'TST',
      decimals: 6,
    });

    const info = await adapter.getTokenInfo('0xCoinType');
    expect(info.address).toBe('0xCoinType');
    expect(info.name).toBe('Test Coin');
    expect(info.symbol).toBe('TST');
    expect(info.decimals).toBe(6);
    expect(info.totalSupply).toBe(0n);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.method).toBe('suix_getCoinMetadata');
  });

  // -------------------------------------------------------------------------
  // readContract
  // -------------------------------------------------------------------------

  it('readContract throws with not supported message', async () => {
    await expect(adapter.readContract('addr', [], 'fn')).rejects.toThrow('not supported');
  });
});
