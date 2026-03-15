// ---------------------------------------------------------------------------
// CLI: vizzor backtest — run historical strategy backtests
// ---------------------------------------------------------------------------

import type { Command } from 'commander';
import { BacktestEngine } from '../../core/backtest/engine.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('cli-backtest');

export function registerBacktestCommand(program: Command): void {
  program
    .command('backtest')
    .description('Run a historical backtest for a trading strategy')
    .requiredOption(
      '-s, --strategy <strategy>',
      'Strategy name (momentum, trend-following, ml-adaptive)',
    )
    .requiredOption('--pair <pair>', 'Trading pair (e.g. BTCUSDT)')
    .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
    .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
    .option('-c, --capital <amount>', 'Initial capital in USD', '10000')
    .option('-t, --timeframe <tf>', 'Candle timeframe', '4h')
    .option('--slippage <bps>', 'Slippage in basis points', '10')
    .option('--commission <pct>', 'Commission percentage', '0.1')
    .action(async (opts) => {
      try {
        const engine = new BacktestEngine({
          strategy: opts.strategy,
          pair: opts.pair,
          from: opts.from,
          to: opts.to,
          initialCapital: Number(opts.capital),
          timeframe: opts.timeframe,
          slippageBps: Number(opts.slippage),
          commissionPct: Number(opts.commission),
        });

        console.log(
          `Running backtest: ${opts.strategy} on ${opts.pair} (${opts.from} → ${opts.to})...\n`,
        );
        const result = await engine.run();

        console.log('=== Backtest Results ===');
        console.log(`Strategy: ${result.config.strategy}`);
        console.log(`Pair: ${result.config.pair}`);
        console.log(`Period: ${result.config.from} → ${result.config.to}`);
        console.log(`Initial Capital: $${result.config.initialCapital.toLocaleString()}`);
        console.log('');
        console.log(
          `Total Return: $${result.metrics.totalReturn.toFixed(2)} (${result.metrics.totalReturnPct.toFixed(2)}%)`,
        );
        console.log(`Win Rate: ${(result.metrics.winRate * 100).toFixed(1)}%`);
        console.log(`Total Trades: ${result.metrics.totalTrades}`);
        console.log(
          `Profit Factor: ${result.metrics.profitFactor === Infinity ? '∞' : result.metrics.profitFactor.toFixed(2)}`,
        );
        console.log(`Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(2)}`);
        console.log(`Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%`);

        if (result.trades.length > 0) {
          console.log('\nLast 5 Trades:');
          for (const t of result.trades.slice(-5)) {
            const dir = t.pnl >= 0 ? '+' : '';
            console.log(
              `  ${new Date(t.entryTime).toISOString().split('T')[0]} → ${new Date(t.exitTime).toISOString().split('T')[0]} | ${t.side} | Entry: $${t.entryPrice.toFixed(2)} → Exit: $${t.exitPrice.toFixed(2)} | PnL: ${dir}$${t.pnl.toFixed(2)} (${dir}${t.pnlPct.toFixed(2)}%)`,
            );
          }
        }
      } catch (err) {
        log.error(`Backtest failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
