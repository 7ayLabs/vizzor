import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// We test the wallet-manager by using a real temp directory.
// The challenge: wallet-manager computes WALLETS_DIR = join(homedir(), '.vizzor', 'wallets')
// at module load time. We mock homedir() via vi.hoisted + vi.mock to point
// at our temp directory.
//
// To avoid stale-module issues across runs, we use a stable temp path
// that we fully control.
// ---------------------------------------------------------------------------

const TEMP_ROOT = join(tmpdir(), 'vizzor-wallet-test-stable');

// Ensure clean slate
rmSync(TEMP_ROOT, { recursive: true, force: true });
mkdirSync(TEMP_ROOT, { recursive: true });

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => TEMP_ROOT,
  };
});

// Silence logger
vi.mock('@/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Force vitest to re-evaluate the module (clears cached WALLETS_DIR)
vi.resetModules();

// Dynamic import so it picks up the mocked homedir
const { createWallet, importWallet, loadWallet, listWallets, deleteWallet } =
  await import('@/core/agent/wallet-manager.js');

const WALLETS_DIR = join(TEMP_ROOT, '.vizzor', 'wallets');

// Clean the wallets directory between tests for isolation
beforeEach(() => {
  if (existsSync(WALLETS_DIR)) {
    rmSync(WALLETS_DIR, { recursive: true, force: true });
  }
});

// Full cleanup after all tests
afterAll(() => {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWallet', () => {
  it('creates an encrypted wallet file', () => {
    const result = createWallet('test-wallet', 'mypassword');

    expect(result.name).toBe('test-wallet');
    expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const filePath = join(WALLETS_DIR, 'test-wallet.json');
    expect(existsSync(filePath)).toBe(true);

    const saved = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(saved.name).toBe('test-wallet');
    expect(saved.salt).toBeDefined();
    expect(saved.iv).toBeDefined();
    expect(saved.tag).toBeDefined();
    expect(saved.ciphertext).toBeDefined();
    expect(saved.createdAt).toBeDefined();
  });

  it('throws when wallet name already exists', () => {
    createWallet('duplicate', 'pass1');

    expect(() => createWallet('duplicate', 'pass2')).toThrow('already exists');
  });

  it('creates the wallets directory if it does not exist', () => {
    expect(existsSync(WALLETS_DIR)).toBe(false);

    createWallet('first-wallet', 'pass');

    expect(existsSync(WALLETS_DIR)).toBe(true);
  });
});

describe('importWallet', () => {
  it('imports a private key and encrypts it', () => {
    const pk = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const result = importWallet('imported', pk, 'secret');

    expect(result.name).toBe('imported');

    // Verify we can decrypt the imported key
    const decrypted = loadWallet('imported', 'secret');
    expect(decrypted).toBe(pk);
  });

  it('adds 0x prefix to private keys without it', () => {
    const pkNoPrefix = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    importWallet('no-prefix', pkNoPrefix, 'secret');

    const decrypted = loadWallet('no-prefix', 'secret');
    expect(decrypted).toBe(`0x${pkNoPrefix}`);
  });

  it('throws when wallet name already exists', () => {
    importWallet(
      'existing',
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      'pass',
    );

    expect(() =>
      importWallet(
        'existing',
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        'pass',
      ),
    ).toThrow('already exists');
  });
});

describe('loadWallet', () => {
  it('decrypts and returns the private key with correct password', () => {
    createWallet('load-test', 'correct-password');

    const privateKey = loadWallet('load-test', 'correct-password');

    expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('throws with wrong password', () => {
    createWallet('wrong-pass', 'correct');

    expect(() => loadWallet('wrong-pass', 'wrong')).toThrow();
  });

  it('throws when wallet does not exist', () => {
    expect(() => loadWallet('nonexistent', 'pass')).toThrow('not found');
  });
});

describe('listWallets', () => {
  it('lists all wallet files', () => {
    createWallet('wallet-a', 'pass');
    createWallet('wallet-b', 'pass');
    createWallet('wallet-c', 'pass');

    const wallets = listWallets();

    expect(wallets.length).toBe(3);
    const names = wallets.map((w: { name: string }) => w.name);
    expect(names).toContain('wallet-a');
    expect(names).toContain('wallet-b');
    expect(names).toContain('wallet-c');
  });

  it('returns empty array when no wallets exist', () => {
    // Ensure the directory exists but is empty
    mkdirSync(WALLETS_DIR, { recursive: true });

    const wallets = listWallets();

    expect(wallets).toEqual([]);
  });

  it('returns name, address, and createdAt for each wallet', () => {
    createWallet('details-test', 'pass');

    const wallets = listWallets();

    expect(wallets[0]!.name).toBe('details-test');
    expect(wallets[0]!.address).toBeDefined();
    expect(wallets[0]!.createdAt).toBeDefined();
  });

  it('ignores non-JSON files in wallets directory', () => {
    createWallet('real-wallet', 'pass');
    writeFileSync(join(WALLETS_DIR, 'notes.txt'), 'not a wallet');

    const wallets = listWallets();

    expect(wallets.length).toBe(1);
    expect(wallets[0]!.name).toBe('real-wallet');
  });
});

describe('deleteWallet', () => {
  it('removes the wallet file', () => {
    createWallet('to-delete', 'pass');
    const filePath = join(WALLETS_DIR, 'to-delete.json');
    expect(existsSync(filePath)).toBe(true);

    deleteWallet('to-delete');

    expect(existsSync(filePath)).toBe(false);
  });

  it('throws when wallet does not exist', () => {
    expect(() => deleteWallet('ghost')).toThrow('not found');
  });

  it('wallet cannot be loaded after deletion', () => {
    createWallet('deleted-wallet', 'pass');
    deleteWallet('deleted-wallet');

    expect(() => loadWallet('deleted-wallet', 'pass')).toThrow('not found');
  });
});
