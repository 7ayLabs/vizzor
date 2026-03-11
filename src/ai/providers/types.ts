// ---------------------------------------------------------------------------
// AI Provider abstraction — shared types for multi-provider support
// ---------------------------------------------------------------------------

/** Handler that executes a tool call and returns its result. */
export type ToolHandler = (name: string, input: unknown) => Promise<unknown>;

/** Callbacks invoked during streaming. */
export interface StreamCallbacks {
  onText: (delta: string) => void;
  onToolStart: (toolName: string) => void;
  onToolEnd: (toolName: string) => void;
  onDone: (fullText: string) => void;
}

/** Provider-agnostic tool definition (JSON Schema based). */
export interface AITool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/** Interface that all AI providers must implement. */
export interface AIProvider {
  /** Provider identifier (e.g. 'anthropic', 'openai'). */
  readonly name: string;

  /** Whether this provider supports tool use (function calling). */
  readonly supportsTools: boolean;

  /**
   * Initialize the provider with credentials and model selection.
   * Called once before any analyze/stream calls.
   */
  initialize(apiKey: string | undefined, model: string, maxTokens: number): void;

  /**
   * Send a message and return the full text response.
   * Includes agentic tool-use loop if tools and handler are provided.
   */
  analyze(
    systemPrompt: string,
    userMessage: string,
    tools?: AITool[],
    toolHandler?: ToolHandler,
  ): Promise<string>;

  /**
   * Stream a message with callbacks for incremental text and tool events.
   * Includes agentic tool-use loop if tools and handler are provided.
   */
  analyzeStream(
    systemPrompt: string,
    userMessage: string,
    callbacks: StreamCallbacks,
    tools?: AITool[],
    toolHandler?: ToolHandler,
  ): Promise<string>;
}

/** Maximum iterations for the agentic tool-use loop. */
export const MAX_ITERATIONS = 10;

/** Default models per provider. */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
  ollama: 'llama3.2',
};
