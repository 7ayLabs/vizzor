// ---------------------------------------------------------------------------
// Store factory — selects DataStore backend based on config
// ---------------------------------------------------------------------------

import type { VizzorConfig } from '../config/schema.js';
import type { DataStore } from './types.js';
import { SqliteStore } from './sqlite-store.js';

let instance: DataStore | null = null;

export async function getStore(config: VizzorConfig): Promise<DataStore> {
  if (instance) return instance;

  if (config.database?.type === 'postgres' && config.database.url) {
    const { PostgresStore } = await import('./postgres-store.js');
    instance = new PostgresStore(config.database.url);
  } else {
    instance = new SqliteStore();
  }

  return instance;
}

export function getStoreInstance(): DataStore | null {
  return instance;
}
