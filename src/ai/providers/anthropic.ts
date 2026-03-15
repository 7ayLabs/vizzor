// ---------------------------------------------------------------------------
// Anthropic provider — Claude integration via @anthropic-ai/sdk
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODELS, MAX_ITERATIONS } from './types.js';
import type { AIProvider, AITool, StreamCallbacks, ToolHandler } from './types.js';

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly supportsTools = true;

  private client: Anthropic | undefined;
  private model = DEFAULT_MODELS['anthropic'] ?? 'claude-sonnet-4-20250514';
  private maxTokens = 8192;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  initialize(apiKey: string | undefined, model: string, maxTokens: number): void {
    if (!apiKey) {
      throw new Error(
        'Anthropic API key is not configured. Set ANTHROPIC_API_KEY or add anthropicApiKey to ~/.vizzor/config.yaml.',
      );
    }

    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  // -------------------------------------------------------------------------
  // Non-streaming analysis with agentic tool-use loop
  // -------------------------------------------------------------------------

  async analyze(
    systemPrompt: string,
    userMessage: string,
    tools?: AITool[],
    toolHandler?: ToolHandler,
  ): Promise<string> {
    const ai = this.getClient();
    const maxIterations = MAX_ITERATIONS; // safety cap for the agentic loop

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages,
        ...(tools && tools.length > 0 ? { tools: tools as Anthropic.Messages.Tool[] } : {}),
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

      // --- Agentic loop: execute tools and continue the conversation --------

      if (!toolHandler) {
        throw new Error('Claude requested tool use but no tool handler was provided.');
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

    // Exhausted the iteration limit.
    return '[Vizzor] The analysis reached the maximum number of tool-use iterations. Partial results may be incomplete.';
  }

  // -------------------------------------------------------------------------
  // Streaming analysis with agentic tool-use loop
  // -------------------------------------------------------------------------

  async analyzeStream(
    systemPrompt: string,
    userMessage: string,
    callbacks: StreamCallbacks,
    tools?: AITool[],
    toolHandler?: ToolHandler,
  ): Promise<string> {
    const ai = this.getClient();
    const maxIterations = MAX_ITERATIONS; // safety cap for the agentic loop

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }];

    // Accumulates text across all iterations so onDone receives the full output.
    let fullText = '';

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const streamParams: Anthropic.Messages.MessageCreateParamsStreaming = {
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages,
        stream: true,
        ...(tools && tools.length > 0 ? { tools: tools as Anthropic.Messages.Tool[] } : {}),
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
        throw new Error(`Anthropic streaming request failed: ${detail}`, {
          cause: err,
        });
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

      if (!toolHandler) {
        throw new Error('Claude requested tool use but no tool handler was provided.');
      }

      // Capture in a const so TypeScript narrows the type inside the async map.
      const handler = toolHandler;

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

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Return the Anthropic client, throwing if not initialised. */
  private getClient(): Anthropic {
    if (!this.client) {
      throw new Error('AnthropicProvider has not been initialised. Call initialize() first.');
    }
    return this.client;
  }
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
