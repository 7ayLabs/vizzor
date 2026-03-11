// ---------------------------------------------------------------------------
// Anthropic SDK wrapper — lazy singleton with agentic tool-use loop
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import type { VizzorConfig } from '../config/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handler that executes a tool call and returns its result. */
type ToolHandler = (name: string, input: unknown) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let client: Anthropic | undefined;
let config: VizzorConfig | undefined;
let toolHandler: ToolHandler | undefined;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise (or re-initialise) the AI client with the given config.
 * The Anthropic instance is created lazily on first use.
 */
export function setConfig(cfg: VizzorConfig): void {
  config = cfg;
  // Force re-creation on next call so a new API key takes effect.
  client = undefined;
}

/**
 * Register the tool executor that the agentic loop invokes when Claude
 * requests a tool call. Commands should call this before starting a chat
 * session that includes tools.
 */
export function setToolHandler(handler: ToolHandler): void {
  toolHandler = handler;
}

/**
 * Return the shared Anthropic client, creating it on first access.
 *
 * @throws If no config has been set or the API key is missing.
 */
export function getAIClient(): Anthropic {
  if (client) return client;

  if (!config?.anthropicApiKey) {
    throw new Error(
      'Anthropic API key is not configured. Set ANTHROPIC_API_KEY or add anthropicApiKey to ~/.vizzor/config.yaml.',
    );
  }

  client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/**
 * Send a message to Claude and return the concatenated text response.
 *
 * When `tools` are provided and Claude responds with `tool_use` blocks the
 * function enters an agentic loop: it executes every requested tool via the
 * registered {@link setToolHandler}, feeds the results back to Claude, and
 * repeats until Claude produces a final text response (or hits the built-in
 * iteration limit).
 *
 * @param systemPrompt - The system prompt that sets Claude's persona.
 * @param userMessage  - The user's input message.
 * @param tools        - Optional array of tool definitions to make available.
 * @returns The concatenated text blocks from Claude's final response.
 */
export async function analyze(
  systemPrompt: string,
  userMessage: string,
  tools?: Anthropic.Messages.Tool[],
): Promise<string> {
  const ai = getAIClient();

  if (!config) {
    throw new Error('AI config has not been initialised. Call setConfig first.');
  }

  const model = config.ai.model;
  const maxTokens = config.ai.maxTokens;
  const maxIterations = 10; // safety cap for the agentic loop

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    };

    const response = await ai.messages.create(params);

    // Collect tool_use blocks from the response.
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );

    // If there are no tool calls, extract text and return.
    if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
      return extractText(response.content);
    }

    // --- Agentic loop: execute tools and continue the conversation ----------

    if (!toolHandler) {
      throw new Error(
        'Claude requested tool use but no tool handler is registered. Call setToolHandler first.',
      );
    }

    // Capture in a const so TypeScript narrows the type inside the async map.
    const handler = toolHandler;

    // Append the assistant's response (including tool_use blocks) so Claude
    // can see what it previously said.
    messages.push({
      role: 'assistant',
      content: response.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        // For any other block type, serialise as text so we don't lose info.
        return { type: 'text' as const, text: JSON.stringify(block) };
      }),
    });

    // Execute each tool and build the tool_result blocks.
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        try {
          const result = await handler(block.name, block.input);
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify({ error: message }),
            is_error: true,
          };
        }
      }),
    );

    messages.push({ role: 'user', content: toolResults });
  }

  // If we exhausted iterations, return whatever text we collected last.
  return '[Vizzor] The analysis reached the maximum number of tool-use iterations. Partial results may be incomplete.';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Concatenate all text blocks from a response's content array. */
function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
}
