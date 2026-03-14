// ---------------------------------------------------------------------------
// Data Collector Service — background OHLCV ingestion from Binance
// ---------------------------------------------------------------------------

import { fetchKlines } from './sources/binance.js';
import type { DataStore, OHLCVRecord } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('collector');

const MAJOR_SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
  'ADA',
  'DOGE',
  'DOT',
  'AVAX',
  'MATIC',
  'LINK',
  'UNI',
  'ATOM',
  'NEAR',
  'ARB',
  'OP',
  'SUI',
  'APT',
  'PEPE',
  'SHIB',
  'FLOKI',
  'BONK',
  'WIF',
];

const TIMEFRAMES = ['1h', '4h'] as const;
const COLLECTION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface CollectorStatus {
  running: boolean;
  symbols: string[];
  timeframes: string[];
  intervalMs: number;
  lastRun: number | null;
  totalRecords: number;
  errors: number;
}

export class DataCollector {
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: CollectorStatus = {
    running: false,
    symbols: MAJOR_SYMBOLS,
    timeframes: [...TIMEFRAMES],
    intervalMs: COLLECTION_INTERVAL_MS,
    lastRun: null,
    totalRecords: 0,
    errors: 0,
  };

  constructor(
    private store: DataStore,
    private symbols: string[] = MAJOR_SYMBOLS,
    private intervalMs: number = COLLECTION_INTERVAL_MS,
  ) {
    this.status.symbols = symbols;
    this.status.intervalMs = intervalMs;
  }

  getStatus(): CollectorStatus {
    return { ...this.status };
  }

  start(): void {
    if (this.status.running) {
      log.warn('Collector already running');
      return;
    }

    log.info(
      `Starting data collector: ${this.symbols.length} symbols, ${TIMEFRAMES.length} timeframes, every ${this.intervalMs / 1000}s`,
    );

    this.status.running = true;

    // Run immediately, then on interval
    void this.collectAll();
    this.timer = setInterval(() => void this.collectAll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.running = false;
    log.info('Data collector stopped');
  }

  private async collectAll(): Promise<void> {
    log.info('Collection cycle starting');
    const start = Date.now();

    for (const timeframe of TIMEFRAMES) {
      for (const symbol of this.symbols) {
        try {
          await this.collectSymbol(symbol, timeframe);
        } catch (err) {
          this.status.errors++;
          log.error(
            `Failed to collect ${symbol}/${timeframe}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    this.status.lastRun = Date.now();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log.info(
      `Collection cycle complete in ${elapsed}s (total records: ${this.status.totalRecords})`,
    );
  }

  private async collectSymbol(symbol: string, timeframe: string): Promise<void> {
    // Fetch last 100 candles (catches up missed data on restart)
    const klines = await fetchKlines(symbol, timeframe, 100);

    const records: OHLCVRecord[] = klines.map((k) => ({
      time: k.openTime,
      symbol: symbol.toUpperCase(),
      timeframe,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      trades: k.trades,
    }));

    await this.store.insertOHLCV(records);
    this.status.totalRecords += records.length;
  }
}
