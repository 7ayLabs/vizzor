// ---------------------------------------------------------------------------
// CLI: vizzor wallet — create, import, list, delete wallets
// ---------------------------------------------------------------------------

import type { Command } from 'commander';
import {
  createWallet,
  importWallet,
  listWallets,
  deleteWallet,
} from '../../core/agent/wallet-manager.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli-wallet');

export function registerWalletCommand(program: Command): void {
  const wallet = program.command('wallet').description('Manage encrypted trading wallets');

  wallet
    .command('create <name>')
    .description('Create a new wallet with a random private key')
    .requiredOption('-p, --password <password>', 'Encryption password')
    .action((name: string, opts: { password: string }) => {
      try {
        const result = createWallet(name, opts.password);
        console.log(`Wallet "${result.name}" created successfully.`);
        console.log(`Address: ${result.address}`);
        console.log('Stored in ~/.vizzor/wallets/');
      } catch (err) {
        log.error(`Failed to create wallet: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  wallet
    .command('import <name>')
    .description('Import a wallet from a private key')
    .requiredOption('-k, --key <privateKey>', 'Private key (hex)')
    .requiredOption('-p, --password <password>', 'Encryption password')
    .action((name: string, opts: { key: string; password: string }) => {
      try {
        const result = importWallet(name, opts.key, opts.password);
        console.log(`Wallet "${result.name}" imported successfully.`);
      } catch (err) {
        log.error(`Failed to import wallet: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  wallet
    .command('list')
    .description('List all saved wallets')
    .action(() => {
      const wallets = listWallets();
      if (wallets.length === 0) {
        console.log('No wallets found.');
        return;
      }
      console.log('Wallets:');
      for (const w of wallets) {
        console.log(`  ${w.name} — ${w.address} (created: ${w.createdAt})`);
      }
    });

  wallet
    .command('delete <name>')
    .description('Delete a wallet')
    .action((name: string) => {
      try {
        deleteWallet(name);
        console.log(`Wallet "${name}" deleted.`);
      } catch (err) {
        log.error(`Failed to delete wallet: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
