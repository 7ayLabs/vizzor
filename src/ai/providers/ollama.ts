// ---------------------------------------------------------------------------
// Ollama provider — local model integration via ollama npm package
// ---------------------------------------------------------------------------

import { Ollama } from 'ollama';
import { DEFAULT_MODELS } from './types.js';
import type { AIProvider, AITool, StreamCallbacks, ToolHandler } from './types.js';

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly supportsTools = false;

  private client!: Ollama;
  private model = DEFAULT_MODELS['ollama']!;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  initialize(apiKey: string | undefined, model: string, _maxTokens: number): void {
    // apiKey is used as the host URL for Ollama (defaults to http://localhost:11434)
    const host = apiKey || 'http://localhost:11434';
    this.client = new Ollama({ host });
    this.model = model;
  }

  // -------------------------------------------------------------------------
  // Non-streaming analysis (no tool use for Ollama)
  // -------------------------------------------------------------------------

  async analyze(
    systemPrompt: string,
    userMessage: string,
    _tools?: AITool[],
    _toolHandler?: ToolHandler,
  ): Promise<string> {
    const response = await this.client.chat({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    return response.message.content;
  }

  // -------------------------------------------------------------------------
  // Streaming analysis (no tool use for Ollama)
  // -------------------------------------------------------------------------

  async analyzeStream(
    systemPrompt: string,
    userMessage: string,
    callbacks: StreamCallbacks,
    _tools?: AITool[],
    _toolHandler?: ToolHandler,
  ): Promise<string> {
    const response = await this.client.chat({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: true,
    });

    let fullText = '';
    for await (const chunk of response) {
      const text = chunk.message.content;
      if (text) {
        fullText += text;
        callbacks.onText(text);
      }
    }

    callbacks.onDone(fullText);
    return fullText;
  }
}
