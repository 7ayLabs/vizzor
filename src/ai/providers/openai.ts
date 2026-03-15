// ---------------------------------------------------------------------------
// OpenAI provider — GPT-4o / GPT-4-turbo with agentic tool-use loop
// ---------------------------------------------------------------------------

import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { DEFAULT_MODELS, MAX_ITERATIONS } from './types.js';
import type { AIProvider, AITool, StreamCallbacks, ToolHandler } from './types.js';

/** Convert provider-agnostic tool definitions to the OpenAI function-calling format. */
function toOpenAITools(tools: AITool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// ---------------------------------------------------------------------------
// Accumulated streaming tool call
// ---------------------------------------------------------------------------

interface AccumulatedToolCall {
  id: string;
  functionName: string;
  arguments: string;
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly supportsTools = true;

  private client: OpenAI | undefined;
  private model = DEFAULT_MODELS['openai'] ?? 'gpt-4o';
  private maxTokens = 4096;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  initialize(apiKey: string | undefined, model: string, maxTokens: number): void {
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is not configured. Set OPENAI_API_KEY or add openaiApiKey to ~/.vizzor/config.yaml.',
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  // -----------------------------------------------------------------------
  // Non-streaming analysis with agentic tool loop
  // -----------------------------------------------------------------------

  async analyze(
    systemPrompt: string,
    userMessage: string,
    tools?: AITool[],
    toolHandler?: ToolHandler,
  ): Promise<string> {
    const client = this.requireClient();

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const openaiTools = tools && tools.length > 0 ? toOpenAITools(tools) : undefined;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      try {
        const response = await client.chat.completions.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages,
          ...(openaiTools ? { tools: openaiTools, tool_choice: 'auto' as const } : {}),
        });

        const choice = response.choices[0];
        if (!choice) {
          return '';
        }

        const message = choice.message;

        // Filter to function-type tool calls only (OpenAI also has a 'custom' variant).
        const toolCalls: ChatCompletionMessageFunctionToolCall[] = (
          message.tool_calls ?? []
        ).filter((tc): tc is ChatCompletionMessageFunctionToolCall => tc.type === 'function');

        // No tool calls — return the text content.
        if (toolCalls.length === 0 || choice.finish_reason !== 'tool_calls') {
          return message.content ?? '';
        }

        // --- Agentic loop: execute tools and continue the conversation ------

        if (!toolHandler) {
          throw new Error('OpenAI requested tool use but no tool handler is registered.');
        }

        // Append the assistant's response (including tool_calls) to the conversation.
        messages.push({
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });

        // Execute each tool and append the results.
        const handler = toolHandler;
        await Promise.all(
          toolCalls.map(async (tc) => {
            let content: string;
            try {
              const input: unknown = JSON.parse(tc.function.arguments);
              const result = await handler(tc.function.name, input);
              content = JSON.stringify(result);
            } catch (err: unknown) {
              const detail = err instanceof Error ? err.message : String(err);
              content = JSON.stringify({ error: detail });
            }
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content,
            });
          }),
        );
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`OpenAI request failed: ${detail}`, { cause: err });
      }
    }

    // Exhausted the iteration limit.
    return '[Vizzor] The analysis reached the maximum number of tool-use iterations. Partial results may be incomplete.';
  }

  // -----------------------------------------------------------------------
  // Streaming analysis with agentic tool loop
  // -----------------------------------------------------------------------

  async analyzeStream(
    systemPrompt: string,
    userMessage: string,
    callbacks: StreamCallbacks,
    tools?: AITool[],
    toolHandler?: ToolHandler,
  ): Promise<string> {
    const client = this.requireClient();

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const openaiTools = tools && tools.length > 0 ? toOpenAITools(tools) : undefined;

    let fullText = '';

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      try {
        const stream = await client.chat.completions.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages,
          stream: true,
          ...(openaiTools ? { tools: openaiTools, tool_choice: 'auto' as const } : {}),
        });

        // Accumulators for the current stream iteration.
        const accumulatedToolCalls = new Map<number, AccumulatedToolCall>();
        let finishReason: string | null = null;

        for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
          const choice = chunk.choices[0];
          if (!choice) continue;

          // Track finish reason.
          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          const delta = choice.delta;

          // Forward text deltas.
          if (delta.content) {
            fullText += delta.content;
            callbacks.onText(delta.content);
          }

          // Accumulate tool calls that arrive incrementally.
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              let acc = accumulatedToolCalls.get(idx);
              if (!acc) {
                acc = { id: '', functionName: '', arguments: '' };
                accumulatedToolCalls.set(idx, acc);
              }
              if (tc.id) {
                acc.id = tc.id;
              }
              if (tc.function?.name) {
                acc.functionName = tc.function.name;
              }
              if (tc.function?.arguments) {
                acc.arguments += tc.function.arguments;
              }
            }
          }
        }

        // If no tool calls were accumulated, we are done.
        if (accumulatedToolCalls.size === 0 || finishReason !== 'tool_calls') {
          callbacks.onDone(fullText);
          return fullText;
        }

        // --- Agentic loop: execute tools and re-stream ----------------------

        if (!toolHandler) {
          throw new Error('OpenAI requested tool use but no tool handler is registered.');
        }

        const handler = toolHandler;
        const toolCallsList = Array.from(accumulatedToolCalls.values());

        // Append the assistant message with accumulated tool calls.
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: toolCallsList.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.functionName,
              arguments: tc.arguments,
            },
          })),
        });

        // Execute each tool and append results.
        for (const tc of toolCallsList) {
          callbacks.onToolStart(tc.functionName);
          let content: string;
          try {
            const input: unknown = JSON.parse(tc.arguments);
            const result = await handler(tc.functionName, input);
            content = JSON.stringify(result);
          } catch (err: unknown) {
            const detail = err instanceof Error ? err.message : String(err);
            content = JSON.stringify({ error: detail });
          }
          callbacks.onToolEnd(tc.functionName);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content,
          });
        }

        // Loop continues — the next iteration will re-stream.
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`OpenAI streaming request failed: ${detail}`, { cause: err });
      }
    }

    // Exhausted the iteration limit.
    const exhaustionNotice =
      '[Vizzor] The analysis reached the maximum number of tool-use iterations. Partial results may be incomplete.';
    fullText += fullText.length > 0 ? `\n\n${exhaustionNotice}` : exhaustionNotice;
    callbacks.onDone(fullText);
    return fullText;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new Error('OpenAI provider has not been initialized. Call initialize() first.');
    }
    return this.client;
  }
}
