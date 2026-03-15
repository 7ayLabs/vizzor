// ---------------------------------------------------------------------------
// BIP-44 HD wallet derivation
// ---------------------------------------------------------------------------

import { HDKey } from '@scure/bip32';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { privateKeyToAddress } from 'viem/accounts';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('hd-wallet');

// BIP-44 derivation paths per chain family
const DERIVATION_PATHS: Record<string, string> = {
  evm: "m/44'/60'/0'/0",
  solana: "m/44'/501'",
  sui: "m/44'/784'/0'/0'",
  aptos: "m/44'/637'/0'/0'",
};

/**
 * Generate a 24-word BIP-39 mnemonic.
 */
export function generateHDMnemonic(): string {
  // 256 bits of entropy = 24 words
  const mnemonic = generateMnemonic(wordlist, 256);
  log.info('Generated new 24-word HD mnemonic');
  return mnemonic;
}

/**
 * Derive an agent key pair from a mnemonic for a given chain family and index.
 *
 * Path structure: `<chain-family-path>/<agentIndex>`
 * e.g. EVM agent 0 → m/44'/60'/0'/0/0
 */
export function deriveAgentKey(
  mnemonic: string,
  chainFamily: string,
  agentIndex: number,
): { privateKey: string; publicKey: string } {
  const basePath = DERIVATION_PATHS[chainFamily];
  if (!basePath) {
    throw new Error(
      `Unsupported chain family: ${chainFamily}. Available: ${Object.keys(DERIVATION_PATHS).join(', ')}`,
    );
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const masterKey = HDKey.fromMasterSeed(seed);

  const derivationPath = `${basePath}/${agentIndex}`;
  const derived = masterKey.derive(derivationPath);

  if (!derived.privateKey || !derived.publicKey) {
    throw new Error(`Failed to derive key at path: ${derivationPath}`);
  }

  // Copy key bytes before zeroing
  const privateKeyHex = `0x${Buffer.from(derived.privateKey).toString('hex')}`;
  const publicKeyHex = `0x${Buffer.from(derived.publicKey).toString('hex')}`;

  // Zero out seed and derived key material
  zeroOut(seed);
  if (derived.privateKey) {
    zeroOut(derived.privateKey);
  }

  log.info(`Derived key for ${chainFamily} agent index ${agentIndex}`);

  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHex,
  };
}

/**
 * Derive an EVM address from a private key using viem.
 */
export function deriveEVMAddress(privateKey: string): string {
  const pk = privateKey.startsWith('0x')
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);

  const address = privateKeyToAddress(pk);
  log.info(`Derived EVM address: ${address}`);
  return address;
}

/**
 * Validate a BIP-39 mnemonic phrase.
 */
export function validateMnemonicPhrase(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/**
 * Zero out a Uint8Array or Buffer to prevent key material from lingering in memory.
 */
function zeroOut(buf: Uint8Array): void {
  buf.fill(0);
}
