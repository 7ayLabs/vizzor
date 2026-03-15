// ---------------------------------------------------------------------------
// Google Gemini provider — Gemini 2.5 Flash / Pro with agentic tool-use loop
// ---------------------------------------------------------------------------

import {
  GoogleGenerativeAI,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerativeModel,
  type Part,
} from '@google/generative-ai';
import { DEFAULT_MODELS, MAX_ITERATIONS } from './types.js';
import type { AIProvider, AITool, StreamCallbacks, ToolHandler } from './types.js';

/**
 * Convert provider-agnostic tool definitions to Gemini's FunctionDeclaration format.
 *
 * Gemini expects `parameters` as a JSON Schema object. Our `AITool.input_schema`
 * is already in that shape, so we pass it through directly.
 */
function toGeminiFunctionDeclarations(tools: AITool[]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema as FunctionDeclaration['parameters'],
  }));
}

/** Extract all FunctionCall parts from a Gemini response's candidate parts. */
function extractFunctionCalls(parts: Part[] | undefined): FunctionCall[] {
  if (!parts) return [];
  const calls: FunctionCall[] = [];
  for (const part of parts) {
    if (part.functionCall) {
      calls.push(part.functionCall);
    }
  }
  return calls;
}

/** Extract concatenated text from Gemini response candidate parts. */
function extractText(parts: Part[] | undefined): string {
  if (!parts) return '';
  return parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly supportsTools = true;

  private genAI: GoogleGenerativeAI | undefined;
  private model = DEFAULT_MODELS['gemini'] ?? 'gemini-2.5-flash';
  private maxTokens = 4096;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  initialize(apiKey: string | undefined, model: string, maxTokens: number): void {
    if (!apiKey) {
      throw new Error(
        'Google Gemini API key is not configured. Set GEMINI_API_KEY or add geminiApiKey to ~/.vizzor/config.yaml.',
      );
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
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
    const genAI = this.requireGenAI();

    // Build the model instance with system instruction and tools baked in.
    const geminiModel = this.createModel(genAI, systemPrompt, tools);

    // Conversation history for multi-turn tool use.
    const history: Content[] = [];

    // Start with the user message; subsequent iterations use function responses.
    let currentContents: Content[] = [{ role: 'user', parts: [{ text: userMessage }] }];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      try {
        const contents: Content[] = [...history, ...currentContents];

        const result = await geminiModel.generateContent({ contents });
        const response = result.response;

        const candidateParts = response.candidates?.[0]?.content?.parts;
        const functionCalls = extractFunctionCalls(candidateParts);

        // No function calls — return text content.
        if (functionCalls.length === 0) {
          return extractText(candidateParts);
        }

        // --- Agentic loop: execute tools and continue the conversation ------

        if (!toolHandler) {
          throw new Error('Gemini requested tool use but no tool handler is registered.');
        }

        const handler = toolHandler;

        // Append the current contents and model response to the history.
        history.push(...currentContents);
        history.push({ role: 'model', parts: candidateParts ?? [] });

        // Execute each function call and build function response parts.
        const functionResponseParts: Part[] = await Promise.all(
          functionCalls.map(async (fc) => {
            try {
              const fnResult = await handler(fc.name, fc.args);
              return {
                functionResponse: {
                  name: fc.name,
                  response: { result: fnResult },
                },
              } as Part;
            } catch (err: unknown) {
              const detail = err instanceof Error ? err.message : String(err);
              return {
                functionResponse: {
                  name: fc.name,
                  response: { error: detail },
                },
              } as Part;
            }
          }),
        );

        // Function responses go into history and become the next turn.
        history.push({ role: 'function', parts: functionResponseParts });

        // Clear currentContents — next iteration builds from history only.
        currentContents = [];
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Gemini request failed: ${detail}`, { cause: err });
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
    const genAI = this.requireGenAI();

    const geminiModel = this.createModel(genAI, systemPrompt, tools);

    const history: Content[] = [];
    let fullText = '';

    // Start with the user message.
    let currentContents: Content[] = [{ role: 'user', parts: [{ text: userMessage }] }];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      try {
        const contents = [...history, ...currentContents];

        const streamResult = await geminiModel.generateContentStream({ contents });

        // Accumulate all parts from the streamed chunks.
        const allParts: Part[] = [];

        for await (const chunk of streamResult.stream) {
          const text = chunk.text();
          if (text) {
            fullText += text;
            callbacks.onText(text);
          }

          // Collect parts for function call detection.
          const candidateParts = chunk.candidates?.[0]?.content?.parts;
          if (candidateParts) {
            allParts.push(...candidateParts);
          }
        }

        // Check for function calls in the accumulated parts.
        const functionCalls = extractFunctionCalls(allParts);

        // No function calls — we are done.
        if (functionCalls.length === 0) {
          callbacks.onDone(fullText);
          return fullText;
        }

        // --- Agentic loop: execute tools and re-stream ----------------------

        if (!toolHandler) {
          throw new Error('Gemini requested tool use but no tool handler is registered.');
        }

        const handler = toolHandler;

        // Append the current contents and model response to history.
        history.push(...currentContents);
        history.push({ role: 'model', parts: allParts });

        // Execute function calls.
        const functionResponseParts: Part[] = [];
        for (const fc of functionCalls) {
          callbacks.onToolStart(fc.name);
          try {
            const result = await handler(fc.name, fc.args);
            functionResponseParts.push({
              functionResponse: {
                name: fc.name,
                response: { result },
              },
            } as Part);
          } catch (err: unknown) {
            const detail = err instanceof Error ? err.message : String(err);
            functionResponseParts.push({
              functionResponse: {
                name: fc.name,
                response: { error: detail },
              },
            } as Part);
          }
          callbacks.onToolEnd(fc.name);
        }

        // Function responses become the next turn.
        history.push({ role: 'function', parts: functionResponseParts });

        // Clear currentContents — next iteration builds from history only.
        currentContents = [];
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Gemini streaming request failed: ${detail}`, { cause: err });
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

  private requireGenAI(): GoogleGenerativeAI {
    if (!this.genAI) {
      throw new Error('Gemini provider has not been initialized. Call initialize() first.');
    }
    return this.genAI;
  }

  /**
   * Create a GenerativeModel with system instruction, tools, and generation config.
   */
  private createModel(
    genAI: GoogleGenerativeAI,
    systemPrompt: string,
    tools?: AITool[],
  ): GenerativeModel {
    const functionDeclarations =
      tools && tools.length > 0 ? toGeminiFunctionDeclarations(tools) : undefined;

    return genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      ...(functionDeclarations ? { tools: [{ functionDeclarations }] } : {}),
      generationConfig: {
        maxOutputTokens: this.maxTokens,
      },
    });
  }
}
