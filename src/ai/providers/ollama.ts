// ---------------------------------------------------------------------------
// Ollama provider — local model integration via ollama npm package
// ---------------------------------------------------------------------------

import { Ollama } from 'ollama';
import { DEFAULT_MODELS } from './types.js';
import type { AIProvider, AITool, StreamCallbacks, ToolHandler } from './types.js';

// ---------------------------------------------------------------------------
// Assistant prefill — forces the model to start answering instead of refusing.
// Local models have strong safety filters that trigger on words like "predict".
// By pre-filling the assistant turn, we bypass the refusal mechanism.
// ---------------------------------------------------------------------------

const PREDICTION_TRIGGERS = [
  'predict',
  'forecast',
  'price target',
  'will it go',
  'future price',
  'price prediction',
  'where will',
  'should i buy',
  'should i sell',
  'going to pump',
];

const ANALYSIS_TRIGGERS = [
  'anali',
  'audit',
  'scan',
  'review',
  'inspect',
  'check',
  'risk',
  'rug',
  'security',
  'forensic',
  'tokenomics',
];

const NEWS_TRIGGERS = ['news', 'headlines', 'latest', 'happening', 'update'];
const TRENDS_TRIGGERS = ['trending', 'hot', 'popular', 'market', 'overview', 'today', 'right now'];

function buildAssistantPrefill(userMessage: string): string {
  const lower = userMessage.toLowerCase();
  const isPrediction = PREDICTION_TRIGGERS.some((t) => lower.includes(t));
  const isAnalysis = ANALYSIS_TRIGGERS.some((t) => lower.includes(t));
  const isNews = NEWS_TRIGGERS.some((t) => lower.includes(t));
  const isTrends = TRENDS_TRIGGERS.some((t) => lower.includes(t));

  if (isPrediction) {
    return 'Based on the real-time market data, here is my price analysis and projection:\n\n';
  }
  if (isAnalysis) {
    return 'Here is my analysis based on the real-time data:\n\n';
  }
  if (isNews) {
    return 'Here is the latest from the crypto markets:\n\n';
  }
  if (isTrends) {
    return 'Here is what is happening in the crypto market right now:\n\n';
  }
  return '';
}

/**
 * Reframe the user message to avoid triggering safety filters.
 * "predict price" → "provide data-driven price scenario analysis"
 * This is needed because local models refuse on "predict" as a keyword.
 */
function reframeForSafety(userMessage: string): string {
  let msg = userMessage;
  // Reframe prediction language to analysis language
  msg = msg.replace(
    /\bpredict(?:ion)?\s+(?:the\s+)?price/gi,
    'provide a data-driven price scenario analysis for',
  );
  msg = msg.replace(/\bpredict\b/gi, 'analyze and project');
  msg = msg.replace(/\bforecast\b/gi, 'project scenarios for');
  msg = msg.replace(
    /\bwill it (?:go|pump|dump|moon|crash)\b/gi,
    'what are the likely scenarios based on data',
  );
  return msg;
}

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
    const safeMessage = reframeForSafety(userMessage);
    const prefill = buildAssistantPrefill(userMessage);

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: safeMessage },
    ];
    // Only inject assistant prefill when we need to steer the model
    if (prefill) {
      messages.push({ role: 'assistant', content: prefill });
    }

    const response = await this.client.chat({
      model: this.model,
      messages,
    });

    return prefill + response.message.content;
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
    const safeMessage = reframeForSafety(userMessage);
    const prefill = buildAssistantPrefill(userMessage);

    // Emit the prefill text first so the user sees it immediately
    if (prefill) callbacks.onText(prefill);

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: safeMessage },
    ];
    if (prefill) {
      messages.push({ role: 'assistant', content: prefill });
    }

    const response = await this.client.chat({
      model: this.model,
      messages,
      stream: true,
    });

    let fullText = prefill;
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
