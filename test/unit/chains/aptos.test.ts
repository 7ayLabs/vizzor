import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AptosAdapter } from '@/chains/aptos/adapter.js';

// ---------------------------------------------------------------------------
// Mock fetch globally so tests don't hit real API
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockApi(result: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(result),
  });
}

let adapter: AptosAdapter;

beforeEach(() => {
  mockFetch.mockReset();
  adapter = new AptosAdapter();
});

// ---------------------------------------------------------------------------
// AptosAdapter
// ---------------------------------------------------------------------------

describe('AptosAdapter', () => {
  // -------------------------------------------------------------------------
  // Static properties
  // -------------------------------------------------------------------------

  it('has correct chainId, name, and nativeCurrency', () => {
    expect(adapter.chainId).toBe('aptos');
    expect(adapter.name).toBe('Aptos');
    expect(adapter.nativeCurrency.symbol).toBe('APT');
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

  it('getBalance returns APT coin balance', async () => {
    mockApi({
      data: {
        coin: { value: '150000000' },
      },
    });

    const balance = await adapter.getBalance('0xAptosAddr');
    expect(balance).toBe(150000000n);

    // Verify the correct resource URL was called
    expect(mockFetch.mock.calls[0]![0]).toContain(
      '/accounts/0xAptosAddr/resource/0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>',
    );
  });

  it('getBalance returns 0n on error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const balance = await adapter.getBalance('0xNonExistent');
    expect(balance).toBe(0n);
  });

  // -------------------------------------------------------------------------
  // getTransactionHistory
  // -------------------------------------------------------------------------

  it('getTransactionHistory maps versions to Transaction[]', async () => {
    mockApi([
      {
        hash: '0xhash1',
        version: '100',
        sender: '0xSender1',
        timestamp: '1700000000000000',
        success: true,
        gas_used: '500',
        gas_unit_price: '100',
      },
      {
        hash: '0xhash2',
        version: '101',
        sender: '0xSender2',
        timestamp: '1700001000000000',
        success: false,
        gas_used: '300',
        gas_unit_price: '100',
      },
    ]);

    const txs = await adapter.getTransactionHistory('0xAptosAddr');
    expect(txs).toHaveLength(2);

    expect(txs[0]!.hash).toBe('0xhash1');
    expect(txs[0]!.blockNumber).toBe(100n);
    expect(txs[0]!.from).toBe('0xSender1');
    expect(txs[0]!.gasUsed).toBe(500n);
    expect(txs[0]!.gasPrice).toBe(100n);
    expect(txs[0]!.timestamp).toBe(1700000000);
    expect(txs[0]!.status).toBe('success');

    expect(txs[1]!.hash).toBe('0xhash2');
    expect(txs[1]!.status).toBe('reverted');
  });

  // -------------------------------------------------------------------------
  // getBlockNumber
  // -------------------------------------------------------------------------

  it('getBlockNumber returns ledger_version', async () => {
    mockApi({ ledger_version: '987654321' });

    const blockNum = await adapter.getBlockNumber();
    expect(blockNum).toBe(987654321n);

    // Verify root URL was called
    expect(mockFetch.mock.calls[0]![0]).toMatch(/\/$/);
  });

  // -------------------------------------------------------------------------
  // readContract
  // -------------------------------------------------------------------------

  it('readContract throws with not supported message', async () => {
    await expect(adapter.readContract('addr', [], 'fn')).rejects.toThrow('not supported');
  });
});
