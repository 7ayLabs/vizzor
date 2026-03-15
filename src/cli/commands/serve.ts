// ---------------------------------------------------------------------------
// CLI command: vizzor serve — start the REST API server
// ---------------------------------------------------------------------------

import chalk from 'chalk';

export async function handleServe(options: {
  port: number;
  host: string;
  auth: boolean;
}): Promise<void> {
  console.log(chalk.bold('Starting Vizzor REST API...'));

  // Initialise AI layer (same as TUI) so /v1/chat can use the provider
  const { loadConfig } = await import('../../config/loader.js');
  const { setConfig, setToolHandler } = await import('../../ai/client.js');
  const { handleTool } = await import('../../ai/tool-handler.js');

  const cfg = loadConfig();
  setConfig(cfg);
  setToolHandler(handleTool);

  const providerName = cfg.ai?.provider ?? 'ollama';
  console.log(chalk.dim(`AI provider: ${providerName}`));

  const { startApiServer } = await import('../../api/server.js');
  await startApiServer({
    port: options.port,
    host: options.host,
    enableAuth: options.auth,
  });

  console.log(chalk.green(`API running on http://${options.host}:${options.port}`));
  console.log(chalk.dim(`Docs: http://${options.host}:${options.port}/docs`));
  console.log(chalk.dim('\nPress Ctrl+C to stop'));

  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down...'));
    process.exit(0);
  });

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  await new Promise(() => {});
}
