import chalk from 'chalk';
import ora from 'ora';
import { fetchMarketData, analyzeTrend } from '../../core/trends/market.js';
import { analyzeSentiment } from '../../core/trends/sentiment.js';
import { generatePrediction } from '../../core/trends/predictor.js';

export async function handleTrends(options: {
  sentiment: boolean;
  chain: string;
  json: boolean;
}): Promise<void> {
  const spinner = ora('Fetching market trends...').start();

  try {
    const symbols = ['bitcoin', 'ethereum', 'solana'];
    const results = await Promise.all(symbols.map((s) => fetchMarketData(s)));

    spinner.stop();

    const marketData = results.filter((r): r is NonNullable<typeof r> => r !== null);

    if (marketData.length === 0) {
      console.log(chalk.yellow('No market data available. Check your API configuration.'));
      return;
    }

    if (options.json) {
      const output = marketData.map((data) => {
        const trend = analyzeTrend(data);
        const sentiment = { overall: 0, sources: [], consensus: 'neutral' as const };
        const prediction = generatePrediction(trend, sentiment, data);
        return { data, trend, prediction };
      });
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Market Trends'));
    console.log();

    for (const data of marketData) {
      const trend = analyzeTrend(data);
      const directionIcon =
        trend.direction === 'bullish'
          ? chalk.green('^')
          : trend.direction === 'bearish'
            ? chalk.red('v')
            : chalk.yellow('-');

      console.log(
        `${directionIcon} ${chalk.bold(data.symbol)} $${data.price.toLocaleString()} ` +
          `${data.priceChange24h >= 0 ? chalk.green(`+${data.priceChange24h.toFixed(2)}%`) : chalk.red(`${data.priceChange24h.toFixed(2)}%`)} ` +
          `Vol: $${(data.volume24h / 1e9).toFixed(2)}B`,
      );

      if (trend.signals.length > 0) {
        for (const signal of trend.signals) {
          console.log(chalk.dim(`    ${signal}`));
        }
      }
    }

    if (options.sentiment) {
      console.log();
      console.log(chalk.bold('Sentiment Analysis'));
      const sentiment = await analyzeSentiment('crypto market');
      console.log(chalk.dim(`  Overall: ${sentiment.consensus}`));
      console.log(chalk.dim('  (Social media integration coming soon)'));
    }

    console.log();
    console.log(chalk.dim('Not financial advice. Always DYOR.'));
  } catch (error) {
    spinner.fail('Failed to fetch trends');
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
