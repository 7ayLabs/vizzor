// ---------------------------------------------------------------------------
// Provider registry — factory + initialisation + availability checking
// ---------------------------------------------------------------------------

import type { AIProvider } from './types.js';
import type { VizzorConfig } from '../../config/schema.js';
import { DEFAULT_MODELS } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a bare (uninitialised) provider instance by name.
 * Call `initialize()` on the returned provider before use.
 */
export function createProvider(name: string): AIProvider {
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'ollama':
      return new OllamaProvider();
    default:
      throw new Error(
        `Unknown AI provider "${name}". Supported: anthropic, openai, gemini, ollama.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Initialisation helper
// ---------------------------------------------------------------------------

/**
 * Creates a provider, resolves the API key and model from config, calls
 * `initialize()`, and returns a ready-to-use provider instance.
 */
export function initializeProvider(name: string, cfg: VizzorConfig): AIProvider {
  const provider = createProvider(name);

  const apiKey = getApiKey(name, cfg);
  const model = resolveModel(name, cfg.ai.model);
  const maxTokens = cfg.ai.maxTokens;

  provider.initialize(apiKey, model, maxTokens);
  return provider;
}

// ---------------------------------------------------------------------------
// Availability checker
// ---------------------------------------------------------------------------

/**
 * Returns an array describing which providers are available (have keys set)
 * and which are not.
 */
export function getAvailableProviders(
  cfg: VizzorConfig,
): { name: string; available: boolean; reason?: string }[] {
  const providers = ['anthropic', 'openai', 'gemini', 'ollama'] as const;

  return providers.map((name) => {
    switch (name) {
      case 'anthropic':
        return cfg.anthropicApiKey
          ? { name, available: true }
          : { name, available: false, reason: 'ANTHROPIC_API_KEY not set' };

      case 'openai':
        return cfg.openaiApiKey
          ? { name, available: true }
          : { name, available: false, reason: 'OPENAI_API_KEY not set' };

      case 'gemini':
        return cfg.googleApiKey
          ? { name, available: true }
          : { name, available: false, reason: 'GOOGLE_API_KEY not set' };

      case 'ollama':
        // Ollama is always "available" — it runs locally and doesn't need an API key.
        return { name, available: true };

      default:
        return { name, available: false, reason: 'Unknown provider' };
    }
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Pick the right model for the given provider. If the user explicitly set a
 * model in config we only honour it when it looks like it belongs to the
 * target provider — otherwise we fall back to the provider's default.
 * This prevents sending e.g. "claude-sonnet-4-20250514" to OpenAI.
 */
function resolveModel(provider: string, configModel: string | undefined): string {
  if (!configModel) {
    return DEFAULT_MODELS[provider] ?? 'unknown';
  }

  const prefixes: Record<string, string[]> = {
    anthropic: ['claude'],
    openai: ['gpt', 'o1', 'o3', 'o4', 'chatgpt', 'davinci', 'babbage'],
    gemini: ['gemini', 'models/gemini'],
    ollama: ['llama', 'mistral', 'codellama', 'phi', 'deepseek', 'qwen', 'gemma'],
  };

  const expectedPrefixes = prefixes[provider];
  if (!expectedPrefixes) {
    return configModel;
  }

  const lower = configModel.toLowerCase();
  const matchesProvider = expectedPrefixes.some((p) => lower.startsWith(p));
  return matchesProvider ? configModel : (DEFAULT_MODELS[provider] ?? configModel);
}

/**
 * Resolves the correct API key (or host URL) for a given provider from config.
 */
function getApiKey(name: string, cfg: VizzorConfig): string | undefined {
  switch (name) {
    case 'anthropic':
      return cfg.anthropicApiKey;
    case 'openai':
      return cfg.openaiApiKey;
    case 'gemini':
      return cfg.googleApiKey;
    case 'ollama':
      return cfg.ai.ollamaHost;
    default:
      return undefined;
  }
}
