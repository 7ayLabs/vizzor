import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { getConfig } from '../../config/loader.js';
import { requireKey } from '../../config/keys.js';

export async function handleChat(): Promise<void> {
  const config = getConfig();
  requireKey('ANTHROPIC_API_KEY', config.anthropicApiKey);

  console.log();
  console.log(chalk.bold('Vizzor Chat'));
  console.log(chalk.dim('AI-powered crypto intelligence. Type "exit" to quit.'));
  console.log(chalk.dim('Ask about projects, tokens, wallets, or market trends.'));
  console.log();

  const { analyze, setToolHandler } = await import('../../ai/client.js');
  const { CHAT_SYSTEM_PROMPT } = await import('../../ai/prompts/chat.js');
  const { VIZZOR_TOOLS } = await import('../../ai/tools.js');
  const { getAdapter } = await import('../../chains/registry.js');

  // Register tool handler for on-chain lookups
  setToolHandler(async (name: string, input: unknown) => {
    const params = input as Record<string, string>;
    const chain = params['chain'] ?? 'ethereum';

    switch (name) {
      case 'get_token_info': {
        const adapter = getAdapter(chain);
        await adapter.connect();
        const info = await adapter.getTokenInfo(params['address'] ?? '');
        await adapter.disconnect();
        return info;
      }
      case 'analyze_wallet': {
        const { analyzeWallet } = await import('../../core/forensics/wallet-analyzer.js');
        const adapter = getAdapter(chain);
        await adapter.connect();
        const result = await analyzeWallet(params['address'] ?? '', adapter);
        await adapter.disconnect();
        return result;
      }
      case 'get_market_data': {
        const { fetchMarketData } = await import('../../core/trends/market.js');
        return await fetchMarketData(params['symbol'] ?? '');
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  });

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
