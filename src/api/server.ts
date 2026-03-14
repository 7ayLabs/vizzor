// ---------------------------------------------------------------------------
// Fastify REST API server
// ---------------------------------------------------------------------------

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createLogger } from '../utils/logger.js';
import { registerMarketRoutes } from './routes/v1/market.js';
import { registerAnalysisRoutes } from './routes/v1/analysis.js';
import { registerSecurityRoutes } from './routes/v1/security.js';
import { authMiddleware } from './auth/middleware.js';
import { errorHandler } from './middleware/error-handler.js';

const log = createLogger('api');

export async function startApiServer(options: {
  port: number;
  host: string;
  enableAuth?: boolean;
  corsOrigin?: string;
}): Promise<void> {
  const server = Fastify({ logger: false });
  const isProd = process.env['NODE_ENV'] === 'production';
  const origin = options.corsOrigin ?? 'http://localhost:3000';

  // Plugins
  await server.register(cors, {
    origin: isProd ? origin : true,
  });
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Vizzor API',
        description: 'AI-powered crypto intelligence REST API',
        version: '0.10.5',
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
      version: '0.10.5',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  // Register route groups
  await server.register(registerMarketRoutes, { prefix: '/v1/market' });
  await server.register(registerAnalysisRoutes, { prefix: '/v1/analysis' });
  await server.register(registerSecurityRoutes, { prefix: '/v1/security' });

  await server.listen({ port: options.port, host: options.host });
  log.info(`Vizzor API listening on ${options.host}:${options.port}`);
  if (!isProd) {
    log.info(`OpenAPI docs at http://${options.host}:${options.port}/docs`);
  }
}
