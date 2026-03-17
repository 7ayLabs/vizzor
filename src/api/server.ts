// ---------------------------------------------------------------------------
// Fastify REST API server
// ---------------------------------------------------------------------------

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../utils/logger.js';
import { registerMarketRoutes } from './routes/v1/market.js';
import { registerAnalysisRoutes } from './routes/v1/analysis.js';
import { registerSecurityRoutes } from './routes/v1/security.js';
import { backtestRoutes } from './routes/v1/backtest.js';
import { agentRoutes } from './routes/v1/agents.js';
import { portfolioRoutes } from './routes/v1/portfolio.js';
import { registerChatRoutes } from './routes/v1/chat.js';
import { registerChronoVisorRoutes } from './routes/v1/chronovisor.js';
import { registerNotificationRoutes } from './routes/v1/notifications.js';
import { registerConversationRoutes } from './routes/v1/conversations.js';
import { authMiddleware } from './auth/middleware.js';
import { errorHandler } from './middleware/error-handler.js';

const log = createLogger('api');

export async function startApiServer(options: {
  port: number;
  host: string;
  enableAuth?: boolean;
  corsOrigin?: string;
}): Promise<void> {
  const server = Fastify({
    logger: false,
    bodyLimit: 1_048_576, // 1MB payload limit
  });
  const isProd = process.env['NODE_ENV'] === 'production';
  const origin = options.corsOrigin ?? 'http://localhost:3000';

  // Security headers
  server.addHook(
    'onSend',
    async (_request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      void reply.header('Content-Security-Policy', "default-src 'self'; script-src 'none'");
      void reply.header('X-Frame-Options', 'DENY');
      void reply.header('X-Content-Type-Options', 'nosniff');
      void reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      void reply.header('X-XSS-Protection', '1; mode=block');
      return payload;
    },
  );

  // Plugins
  await server.register(cors, {
    origin: isProd ? origin : true,
  });
  await server.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Vizzor API',
        description: 'AI-powered crypto intelligence REST API',
        version: '0.12.0',
      },
      servers: [{ url: `http://${options.host}:${options.port}` }],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        },
      },
    },
  });

  // Only register Swagger UI in non-production
  if (!isProd) {
    await server.register(swaggerUi, {
      routePrefix: '/docs',
    });
  }

  // Auth middleware — enabled by default
  if (options.enableAuth !== false) {
    server.addHook('onRequest', authMiddleware);
  } else if (isProd) {
    log.warn('API authentication is DISABLED in production — this is insecure');
  }

  // Error handler
  server.setErrorHandler(errorHandler);

  // Health — minimal info in production
  server.get('/health', async () => {
    if (isProd) {
      return { status: 'ok' };
    }
    return {
      status: 'ok',
      version: '0.12.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // Register route groups
  await server.register(registerMarketRoutes, { prefix: '/v1/market' });
  await server.register(registerAnalysisRoutes, { prefix: '/v1/analysis' });
  await server.register(registerSecurityRoutes, { prefix: '/v1/security' });
  await server.register(registerChronoVisorRoutes, { prefix: '/v1/chronovisor' });
  await server.register(registerNotificationRoutes, { prefix: '/v1' });
  await server.register(registerChatRoutes, { prefix: '/v1' });
  await server.register(registerConversationRoutes, { prefix: '/v1' });
  await server.register(backtestRoutes);
  await server.register(agentRoutes);
  await server.register(portfolioRoutes);

  // Initialize notification service
  try {
    const { initNotificationService } = await import('../notifications/service.js');
    await initNotificationService();
  } catch (err) {
    log.warn(
      `Notification service init failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await server.listen({ port: options.port, host: options.host });
  log.info(`Vizzor API listening on ${options.host}:${options.port}`);
  if (!isProd) {
    log.info(`OpenAPI docs at http://${options.host}:${options.port}/docs`);
  }
}
