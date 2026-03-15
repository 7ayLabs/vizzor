// ---------------------------------------------------------------------------
// Chat API route — POST /v1/chat (SSE streaming)
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { getProvider, getConfig, switchProvider } from '../../../ai/client.js';
import { buildChatSystemPrompt } from '../../../ai/prompts/chat.js';
import { VIZZOR_TOOLS } from '../../../ai/tools.js';
import { handleTool } from '../../../ai/tool-handler.js';
import type { ToolHandler, StreamCallbacks } from '../../../ai/providers/types.js';
import { buildContextBlock } from '../../../ai/context-injector.js';
import { getAvailableProviders } from '../../../ai/providers/registry.js';
import { createLogger } from '../../../utils/logger.js';

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
        },
        required: ['messages'],
      },
    },
    handler: async (request, reply) => {
      const { messages } = request.body as { messages: ChatMessage[] };

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

      try {
        const provider = getProvider();
        const systemPrompt = buildChatSystemPrompt();

        // Build conversation context from prior messages
        const lastUserMsg = messages[messages.length - 1] as ChatMessage;
        const priorMessages = messages.slice(0, -1);
        let contextBlock = '';
        if (priorMessages.length > 0) {
          contextBlock = '\n\n## Conversation History\n\n';
          for (const msg of priorMessages) {
            contextBlock += `**${msg.role === 'user' ? 'User' : 'Assistant'}**: ${msg.content}\n\n`;
          }
        }

        const fullSystemPrompt = systemPrompt + contextBlock;
        const userMessage = lastUserMsg.content;

        if (!provider.supportsTools) {
          // Non-tool provider: inject context and do single pass
          const { OLLAMA_SYSTEM_PROMPT } = await import('../../../ai/prompts/chat.js');
          const context = await buildContextBlock(userMessage);
          const enrichedPrompt =
            OLLAMA_SYSTEM_PROMPT + (context ? '\n' + context : '') + contextBlock;

          const callbacks: StreamCallbacks = {
            onText: (delta) => write('text', { delta }),
            onToolStart: () => {
              /* handled by wrappedHandler */
            },
            onToolEnd: () => {
              /* handled by wrappedHandler */
            },
            onDone: (fullText) => write('done', { fullText }),
          };

          await provider.analyzeStream(enrichedPrompt, userMessage, callbacks);
          reply.raw.end();
          return;
        }

        // Tool-use provider: wrap handleTool to emit SSE events
        const wrappedHandler: ToolHandler = async (name, input) => {
          write('tool_start', { tool: name, input });
          const result = await handleTool(name, input);
          write('tool_result', { tool: name, result });
          return result;
        };

        const callbacks: StreamCallbacks = {
          onText: (delta) => write('text', { delta }),
          onToolStart: (toolName) => write('tool_start', { tool: toolName, input: {} }),
          onToolEnd: (toolName) => write('tool_result', { tool: toolName, result: {} }),
          onDone: (fullText) => write('done', { fullText }),
        };

        await provider.analyzeStream(
          fullSystemPrompt,
          userMessage,
          callbacks,
          VIZZOR_TOOLS,
          wrappedHandler,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        log.error(`Chat stream error: ${message}`);
        write('error', { message });
      }

      reply.raw.end();
    },
  });
}
