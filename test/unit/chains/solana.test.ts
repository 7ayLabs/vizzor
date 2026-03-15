import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolanaAdapter } from '@/chains/solana/adapter.js';

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

let adapter: SolanaAdapter;

beforeEach(() => {
  mockFetch.mockReset();
  adapter = new SolanaAdapter();
});

// ---------------------------------------------------------------------------
// SolanaAdapter
// ---------------------------------------------------------------------------

describe('SolanaAdapter', () => {
  // -------------------------------------------------------------------------
  // Static properties
  // -------------------------------------------------------------------------

  it('has correct chainId, name, and nativeCurrency', () => {
    expect(adapter.chainId).toBe('solana');
    expect(adapter.name).toBe('Solana');
    expect(adapter.nativeCurrency.symbol).toBe('SOL');
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
    expect(adapter.isConnected()).toBe(true);
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // getBalance
  // -------------------------------------------------------------------------

  it('getBalance returns bigint from RPC result', async () => {
    mockRpc({ value: 1000000000 });

    const balance = await adapter.getBalance('SomeAddress111');
    expect(balance).toBe(1000000000n);
  });

  // -------------------------------------------------------------------------
  // getTokenBalance
  // -------------------------------------------------------------------------

  it('getTokenBalance returns 0n when no token accounts', async () => {
    mockRpc({ value: [] });

    const balance = await adapter.getTokenBalance('OwnerAddr', 'MintAddr');
    expect(balance).toBe(0n);
  });

  it('getTokenBalance returns amount when accounts exist', async () => {
    mockRpc({
      value: [
        {
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: { amount: '5000000' },
                },
              },
            },
          },
        },
      ],
    });

    const balance = await adapter.getTokenBalance('OwnerAddr', 'MintAddr');
    expect(balance).toBe(5000000n);
  });

  // -------------------------------------------------------------------------
  // getTransactionHistory
  // -------------------------------------------------------------------------

  it('getTransactionHistory returns mapped transactions', async () => {
    mockRpc([
      { signature: 'sig1', blockTime: 1700000000, slot: 200000000, err: null },
      { signature: 'sig2', blockTime: 1700000100, slot: 200000001, err: { msg: 'fail' } },
    ]);

    const txs = await adapter.getTransactionHistory('SomeAddr');
    expect(txs).toHaveLength(2);

    expect(txs[0]!.hash).toBe('sig1');
    expect(txs[0]!.blockNumber).toBe(200000000n);
    expect(txs[0]!.from).toBe('SomeAddr');
    expect(txs[0]!.timestamp).toBe(1700000000);
    expect(txs[0]!.status).toBe('success');

    expect(txs[1]!.hash).toBe('sig2');
    expect(txs[1]!.status).toBe('reverted');
  });

  // -------------------------------------------------------------------------
  // getBlockNumber
  // -------------------------------------------------------------------------

  it('getBlockNumber returns slot as bigint', async () => {
    mockRpc(250000000);

    const block = await adapter.getBlockNumber();
    expect(block).toBe(250000000n);
  });

  // -------------------------------------------------------------------------
  // getTokenInfo
  // -------------------------------------------------------------------------

  it('getTokenInfo returns token info from parsed account', async () => {
    mockRpc({
      value: {
        data: {
          parsed: {
            info: {
              decimals: 6,
              supply: '1000000000000',
            },
          },
        },
      },
    });

    const info = await adapter.getTokenInfo('TokenMintAddr');
    expect(info.address).toBe('TokenMintAddr');
    expect(info.decimals).toBe(6);
    expect(info.totalSupply).toBe(1000000000000n);
    expect(info.name).toBe('SPL Token');
    expect(info.symbol).toBe('SPL');
  });

  // -------------------------------------------------------------------------
  // readContract
  // -------------------------------------------------------------------------

  it('readContract throws with not supported message', async () => {
    await expect(adapter.readContract('addr', [], 'fn')).rejects.toThrow('not supported');
  });
});
