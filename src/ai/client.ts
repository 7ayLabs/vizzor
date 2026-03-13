// ---------------------------------------------------------------------------
// AI client facade — thin wrapper over the active AI provider
// ---------------------------------------------------------------------------

import type { VizzorConfig } from '../config/schema.js';
import type { AIProvider, ToolHandler, AITool } from './providers/types.js';
import { initializeProvider } from './providers/registry.js';
import { buildContextBlock } from './context-injector.js';

// Re-export types so existing consumers don't need to change their import paths.
export type { ToolHandler, AITool } from './providers/types.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let provider: AIProvider | undefined;
let config: VizzorConfig | undefined;
let toolHandler: ToolHandler | undefined;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the AI layer with the given config. Creates and initialises the
 * provider specified by `cfg.ai.provider`.
 */
export function setConfig(cfg: VizzorConfig): void {
  config = cfg;
  provider = initializeProvider(cfg.ai.provider, cfg);
}

/**
 * Register the tool executor that the agentic loop invokes when the AI
 * requests a tool call.
 */
export function setToolHandler(handler: ToolHandler): void {
  toolHandler = handler;
}

/**
 * Return the current VizzorConfig, or `undefined` if not yet set.
 */
export function getConfig(): VizzorConfig | undefined {
  return config;
}

/**
 * Return the registered tool handler, or `undefined` if none is set.
 */
export function getToolHandler(): ToolHandler | undefined {
  return toolHandler;
}

/**
 * Return the active AI provider.
 *
 * @throws If no provider has been initialised.
 */
export function getProvider(): AIProvider {
  if (!provider) {
    throw new Error('AI provider has not been initialised. Call setConfig first.');
  }
  return provider;
}

/**
 * Switch to a different provider at runtime (e.g. from the `/provider` TUI
 * command). Re-initialises the provider with the current config.
 */
export function switchProvider(name: string): void {
  if (!config) {
    throw new Error('Config has not been set. Call setConfig first.');
  }
  provider = initializeProvider(name, config);
}

/**
 * Send a message to the active provider and return the full text response.
 * Includes agentic tool-use loop when tools and a tool handler are available.
 *
 * For providers that don't support tool use (e.g. Ollama), real-time data
 * is automatically fetched and injected into the system prompt.
 */
export async function analyze(
  systemPrompt: string,
  userMessage: string,
  tools?: AITool[],
): Promise<string> {
  const p = getProvider();

  if (!p.supportsTools) {
    // Inject real-time data into the prompt for providers without tool use
    const { OLLAMA_SYSTEM_PROMPT } = await import('./prompts/chat.js');
    const context = await buildContextBlock(userMessage);
    const enrichedPrompt = OLLAMA_SYSTEM_PROMPT + (context ? '\n' + context : '');
    return p.analyze(enrichedPrompt, userMessage);
  }

  return p.analyze(systemPrompt, userMessage, tools, toolHandler);
}
