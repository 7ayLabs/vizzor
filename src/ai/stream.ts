// ---------------------------------------------------------------------------
// Streaming Anthropic SDK wrapper — agentic tool-use loop with live output
// ---------------------------------------------------------------------------

import type Anthropic from '@anthropic-ai/sdk';
import { getAIClient, getConfig, getToolHandler } from './client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callbacks invoked during the streaming agentic loop. */
export interface StreamCallbacks {
  /** Called for every incremental text delta as Claude streams its response. */
  onText: (delta: string) => void;
  /** Called when Claude requests a tool and before execution begins. */
  onToolStart: (toolName: string) => void;
  /** Called after a tool execution completes (success or error). */
  onToolEnd: (toolName: string) => void;
  /** Called once after the final iteration when no more tool calls remain. */
  onDone: (fullText: string) => void;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stream a message to Claude and invoke callbacks as tokens arrive.
 *
 * This is the streaming counterpart of {@link analyze} from `client.ts`.
 * When `tools` are provided and Claude responds with `tool_use` blocks the
 * function enters an agentic loop identical to `analyze`: it executes every
 * requested tool via the registered tool handler, feeds the results back, and
 * re-streams until Claude produces a final text-only response (or the
 * iteration limit is reached).
 *
 * @param systemPrompt - The system prompt that sets Claude's persona.
 * @param userMessage  - The user's input message.
 * @param callbacks    - Lifecycle callbacks for streaming events.
 * @param tools        - Optional array of tool definitions to make available.
 * @returns The concatenated text from Claude's final response.
 */
export async function analyzeStream(
  systemPrompt: string,
  userMessage: string,
  callbacks: StreamCallbacks,
  tools?: Anthropic.Messages.Tool[],
): Promise<string> {
  const ai = getAIClient();
  const config = getConfig();

  if (!config) {
    throw new Error('AI config has not been initialised. Call setConfig first.');
  }

  const model = config.ai.model;
  const maxTokens = config.ai.maxTokens;
  const maxIterations = 10; // safety cap for the agentic loop

  const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }];

  // Accumulates text across all iterations so onDone receives the full output.
  let fullText = '';

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const streamParams: Anthropic.Messages.MessageCreateParamsStreaming = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
    };

    // --- Stream the response -----------------------------------------------

    const stream = ai.messages.stream(streamParams);

    // Forward incremental text deltas to the caller.
    stream.on('text', (delta) => {
      fullText += delta;
      callbacks.onText(delta);
    });

    let finalMessage: Anthropic.Messages.Message;
    try {
      finalMessage = await stream.finalMessage();
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Anthropic streaming request failed: ${detail}`, { cause: err });
    }

    // --- Check for tool use ------------------------------------------------

    const toolUseBlocks = finalMessage.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );

    // No tool calls — we are done.
    if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
      callbacks.onDone(fullText);
      return fullText;
    }

    // --- Agentic loop: execute tools and continue streaming ----------------

    const handler = getToolHandler();
    if (!handler) {
      throw new Error(
        'Claude requested tool use but no tool handler is registered. Call setToolHandler first.',
      );
    }

    // Append the assistant's full response (text + tool_use blocks) to the
    // conversation so Claude can see what it previously said.
    messages.push({
      role: 'assistant',
      content: finalMessage.content.map((block) => {
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

    // Execute each requested tool and build the tool_result blocks.
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        callbacks.onToolStart(block.name);
        try {
          const result = await handler(block.name, block.input);
          callbacks.onToolEnd(block.name);
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        } catch (err: unknown) {
          callbacks.onToolEnd(block.name);
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

    // Loop continues — the next iteration will stream Claude's follow-up.
  }

  // Exhausted the iteration limit.
  const exhaustionNotice =
    '[Vizzor] The analysis reached the maximum number of tool-use iterations. Partial results may be incomplete.';
  fullText += fullText.length > 0 ? `\n\n${exhaustionNotice}` : exhaustionNotice;
  callbacks.onDone(fullText);
  return fullText;
}
