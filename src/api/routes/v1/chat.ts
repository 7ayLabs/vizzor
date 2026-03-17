// ---------------------------------------------------------------------------
// Chat API route — POST /v1/chat (SSE streaming)
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { getProvider, getConfig, switchProvider } from '../../../ai/client.js';
import { buildChatSystemPrompt } from '../../../ai/prompts/chat.js';
import { VIZZOR_TOOLS } from '../../../ai/tools.js';
import { handleTool } from '../../../ai/tool-handler.js';
import type {
  ToolHandler,
  StreamCallbacks,
  ChatMessage as ProviderChatMessage,
} from '../../../ai/providers/types.js';
import { buildContextBlock } from '../../../ai/context-injector.js';
import { getAvailableProviders } from '../../../ai/providers/registry.js';
import { createLogger } from '../../../utils/logger.js';
import { createConversation, addMessage } from '../../../data/conversations.js';

const log = createLogger('api:chat');

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function registerChatRoutes(server: FastifyInstance): Promise<void> {
  // GET /v1/provider — current provider + available providers
  server.get('/provider', {
    schema: {
      tags: ['Chat'],
      summary: 'Get current AI provider and available providers',
    },
    handler: async () => {
      const cfg = getConfig();
      const current = getProvider().name;
      const providers = cfg ? getAvailableProviders(cfg) : [];
      return { current, providers };
    },
  });

  // PUT /v1/provider — switch AI provider at runtime
  server.put('/provider', {
    schema: {
      tags: ['Chat'],
      summary: 'Switch AI provider',
      body: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['anthropic', 'openai', 'gemini', 'ollama'] },
        },
        required: ['provider'],
      },
    },
    handler: async (request) => {
      const { provider } = request.body as { provider: string };
      switchProvider(provider);
      const current = getProvider().name;
      return { current, message: `Switched to ${current}` };
    },
  });

  server.post('/chat', {
    schema: {
      tags: ['Chat'],
      summary: 'AI chat with SSE streaming and tool use',
      body: {
        type: 'object',
        properties: {
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string' },
              },
              required: ['role', 'content'],
            },
          },
          conversationId: {
            type: 'string',
            description: 'Existing conversation ID for persistence',
          },
        },
        required: ['messages'],
      },
    },
    handler: async (request, reply) => {
      const { messages, conversationId: incomingConvId } = request.body as {
        messages: ChatMessage[];
        conversationId?: string;
      };

      if (!messages.length) {
        return reply.status(400).send({ error: 'messages array cannot be empty' });
      }

      // Set SSE headers — include CORS since reply.raw bypasses Fastify's plugin
      const isProd = process.env['NODE_ENV'] === 'production';
      const allowedOrigin = isProd
        ? (process.env['CORS_ORIGIN'] ?? 'http://localhost:3000')
        : (request.headers.origin ?? '*');
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': allowedOrigin,
        ...(isProd ? {} : { 'Access-Control-Allow-Credentials': 'true' }),
      });

      const write = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      // --- Conversation persistence setup ---
      let convId = incomingConvId ?? null;

      try {
        const provider = getProvider();
        const systemPrompt = buildChatSystemPrompt();

        // Build conversation history from prior messages
        const lastUserMsg = messages[messages.length - 1] as ChatMessage;
        const priorMessages = messages.slice(0, -1) as ProviderChatMessage[];
        const userMessage = lastUserMsg.content;

        // Auto-create conversation if none provided
        if (!convId) {
          const title = userMessage.length > 50 ? userMessage.slice(0, 50) + '...' : userMessage;
          convId = createConversation(title);
          write('conversation', { conversationId: convId });
        }

        // Persist the user message
        addMessage(convId, { role: 'user', content: userMessage });

        // Collectors for assistant response persistence
        const collectedToolCalls: unknown[] = [];
        let collectedTokenData: unknown[] | undefined;

        if (!provider.supportsTools) {
          // Non-tool provider: inject context and do single pass
          const { OLLAMA_SYSTEM_PROMPT } = await import('../../../ai/prompts/chat.js');
          const {
            contextText,
            tokenData: allTokens,
            queriedSymbols,
          } = await buildContextBlock(userMessage, { compact: true });

          // Emit structured token data — filter to queried tokens only (no baseline noise)
          const tokens =
            queriedSymbols.length > 0
              ? allTokens.filter((t) => queriedSymbols.includes(t.symbol))
              : allTokens;
          if (tokens.length > 0) {
            write('token_data', { tokens });
            collectedTokenData = tokens;
          }

          const enrichedPrompt = OLLAMA_SYSTEM_PROMPT + (contextText ? '\n' + contextText : '');

          const callbacks: StreamCallbacks = {
            onText: (delta) => write('text', { delta }),
            onToolStart: () => {
              /* handled by wrappedHandler */
            },
            onToolEnd: () => {
              /* handled by wrappedHandler */
            },
            onDone: (fullText) => {
              write('done', { fullText });
              // Persist assistant message
              if (convId) {
                addMessage(convId, {
                  role: 'assistant',
                  content: fullText,
                  toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
                  tokenData: collectedTokenData,
                });
              }
            },
          };

          await provider.analyzeStream(
            enrichedPrompt,
            userMessage,
            callbacks,
            undefined,
            undefined,
            priorMessages,
          );
          reply.raw.end();
          return;
        }

        // Tool-use provider: wrap handleTool to emit SSE events
        const wrappedHandler: ToolHandler = async (name, input) => {
          write('tool_start', { tool: name, input });
          const result = await handleTool(name, input);
          write('tool_result', { tool: name, result });
          collectedToolCalls.push({ tool: name, input, result });
          return result;
        };

        const callbacks: StreamCallbacks = {
          onText: (delta) => write('text', { delta }),
          onToolStart: (toolName) => write('tool_start', { tool: toolName, input: {} }),
          onToolEnd: (toolName) => write('tool_result', { tool: toolName, result: {} }),
          onDone: (fullText) => {
            write('done', { fullText });
            // Persist assistant message
            if (convId) {
              addMessage(convId, {
                role: 'assistant',
                content: fullText,
                toolCalls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
                tokenData: collectedTokenData,
              });
            }
          },
        };

        await provider.analyzeStream(
          systemPrompt,
          userMessage,
          callbacks,
          VIZZOR_TOOLS,
          wrappedHandler,
          priorMessages,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        log.error(`Chat stream error: ${message}`);
        write('error', { message });
      }

      reply.raw.end();
    },
  });

  // POST /v1/chat/thread
  server.post('/thread', async (request, reply) => {
    const body = request.body as { parentMessageId: string; message: string; apiKey?: string };
    if (!body.parentMessageId || !body.message) {
      return reply.status(400).send({ error: 'parentMessageId and message are required' });
    }
    // Thread replies use the same chat flow but include parent context
    // For now, return a placeholder that integrates with existing chat SSE
    return {
      threadId: body.parentMessageId,
      message: body.message,
      status: 'queued',
    };
  });
}
