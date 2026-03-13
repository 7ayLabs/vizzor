import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { getConfig } from '../../config/loader.js';
import { DEFAULT_CHAIN } from '../../config/constants.js';
import { setConfig, setToolHandler, analyze } from '../../ai/client.js';
import { CHAT_SYSTEM_PROMPT } from '../../ai/prompts/chat.js';
import { VIZZOR_TOOLS } from '../../ai/tools.js';
import { getAdapter } from '../../chains/registry.js';
import {
  fetchMarketData,
  fetchTokenFromDex,
  fetchTrendingTokens,
} from '../../core/trends/market.js';
import { fetchUpcomingICOs, searchICOs } from '../../core/scanner/ico-tracker.js';
import { fetchCryptoNews } from '../../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../../data/sources/defillama.js';

export async function handleChat(): Promise<void> {
  const config = getConfig();

  // Initialise the AI provider
  setConfig(config);

  // Register tool handler for on-chain lookups
  setToolHandler(async (name: string, input: unknown) => {
    const params = input as Record<string, string>;
    const chain = params['chain'] ?? DEFAULT_CHAIN;

    switch (name) {
      case 'get_token_info': {
        const adapter = getAdapter(chain);
        await adapter.connect(undefined, config.etherscanApiKey);
        const info = await adapter.getTokenInfo(params['address'] ?? '');
        await adapter.disconnect();
        return info;
      }
      case 'analyze_wallet': {
        const { analyzeWallet } = await import('../../core/forensics/wallet-analyzer.js');
        const adapter = getAdapter(chain);
        await adapter.connect(undefined, config.etherscanApiKey);
        const result = await analyzeWallet(params['address'] ?? '', adapter);
        await adapter.disconnect();
        return result;
      }
      case 'get_market_data': {
        return await fetchMarketData(params['symbol'] ?? '');
      }
      case 'search_upcoming_icos': {
        const category = params['category'] || undefined;
        const chain_ = params['chain'] || undefined;
        const projects =
          category || chain_
            ? await searchICOs(undefined, category, chain_)
            : await fetchUpcomingICOs();
        return { projects };
      }
      case 'search_token_dex': {
        const pairs = await fetchTokenFromDex(params['query'] ?? '');
        return {
          results: pairs.slice(0, 5).map((p) => ({
            name: p.baseToken.name,
            symbol: p.baseToken.symbol,
            chain: p.chainId,
            priceUsd: p.priceUsd,
            volume24h: p.volume?.h24 ?? 0,
            priceChange24h: p.priceChange?.h24 ?? 0,
            marketCap: p.marketCap ?? p.fdv ?? null,
            url: p.url,
          })),
        };
      }
      case 'get_trending': {
        const trending = await fetchTrendingTokens();
        return { trending: trending.slice(0, 10) };
      }
      case 'get_crypto_news': {
        const news = await fetchCryptoNews(params['symbol'] || undefined, config.cryptopanicApiKey);
        return { news: news.slice(0, 10) };
      }
      case 'get_raises': {
        const raises = await fetchRecentRaises(30);
        return { raises: raises.slice(0, 10) };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  });

  console.log();
  console.log(chalk.bold(`Vizzor Chat (${config.ai.provider})`));
  console.log(chalk.dim('AI-powered crypto intelligence. Type "exit" to quit.'));
  console.log(chalk.dim('Ask about projects, tokens, wallets, or market trends.'));
  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('vizzor> '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(chalk.dim('Goodbye.'));
      rl.close();
      return;
    }

    try {
      process.stdout.write(chalk.dim('Thinking...\r'));
      const response = await analyze(CHAT_SYSTEM_PROMPT, input, VIZZOR_TOOLS);
      process.stdout.write('\r' + ' '.repeat(20) + '\r');
      console.log();
      console.log(response);
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${message}`));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
