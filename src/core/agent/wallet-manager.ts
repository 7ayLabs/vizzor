// ---------------------------------------------------------------------------
// Wallet manager — encrypted key storage in ~/.vizzor/wallets/
// ---------------------------------------------------------------------------

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('wallet-manager');

const WALLETS_DIR = join(homedir(), '.vizzor', 'wallets');
const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

interface EncryptedWallet {
  name: string;
  address: string;
  salt: string; // hex
  iv: string; // hex
  tag: string; // hex
  ciphertext: string; // hex
  createdAt: string;
}

function ensureDir(): void {
  if (!existsSync(WALLETS_DIR)) {
    mkdirSync(WALLETS_DIR, { recursive: true });
  }
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

function encrypt(
  plaintext: string,
  password: string,
): { salt: string; iv: string; tag: string; ciphertext: string } {
  const salt = randomBytes(32);
  const key = deriveKey(password, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };
}

function decrypt(
  data: { salt: string; iv: string; tag: string; ciphertext: string },
  password: string,
): string {
  const salt = Buffer.from(data.salt, 'hex');
  const key = deriveKey(password, salt);
  const iv = Buffer.from(data.iv, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function createWallet(name: string, password: string): { name: string; address: string } {
  ensureDir();
  const filePath = join(WALLETS_DIR, `${name}.json`);
  if (existsSync(filePath)) {
    throw new Error(`Wallet "${name}" already exists`);
  }

  // Generate random private key
  const privateKey = `0x${randomBytes(32).toString('hex')}`;

  // Derive address (simple keccak256 of public key — use viem at runtime)
  // For now, store a placeholder that gets resolved on load
  const { salt, iv, tag, ciphertext } = encrypt(privateKey, password);
  const wallet: EncryptedWallet = {
    name,
    address: '(derived on load)',
    salt,
    iv,
    tag,
    ciphertext,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(filePath, JSON.stringify(wallet, null, 2));
  log.info(`Wallet "${name}" created at ${filePath}`);
  return { name, address: wallet.address };
}

export function importWallet(
  name: string,
  privateKey: string,
  password: string,
): { name: string; address: string } {
  ensureDir();
  const filePath = join(WALLETS_DIR, `${name}.json`);
  if (existsSync(filePath)) {
    throw new Error(`Wallet "${name}" already exists`);
  }

  const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const { salt, iv, tag, ciphertext } = encrypt(pk, password);
  const wallet: EncryptedWallet = {
    name,
    address: '(derived on load)',
    salt,
    iv,
    tag,
    ciphertext,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(filePath, JSON.stringify(wallet, null, 2));
  log.info(`Wallet "${name}" imported`);
  return { name, address: wallet.address };
}

export function loadWallet(name: string, password: string): string {
  const filePath = join(WALLETS_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }

  const wallet: EncryptedWallet = JSON.parse(readFileSync(filePath, 'utf8'));
  return decrypt(wallet, password);
}

export function listWallets(): { name: string; address: string; createdAt: string }[] {
  ensureDir();
  const files = readdirSync(WALLETS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const wallet: EncryptedWallet = JSON.parse(readFileSync(join(WALLETS_DIR, f), 'utf8'));
    return { name: wallet.name, address: wallet.address, createdAt: wallet.createdAt };
  });
}

export function deleteWallet(name: string): void {
  const filePath = join(WALLETS_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Wallet "${name}" not found`);
  }
  unlinkSync(filePath);
  log.info(`Wallet "${name}" deleted`);
}
