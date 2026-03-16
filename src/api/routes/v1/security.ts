// ---------------------------------------------------------------------------
// Security & chain API routes — /v1/security/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import { handleTool } from '../../../ai/tool-handler.js';

export async function registerSecurityRoutes(server: FastifyInstance): Promise<void> {
  server.post('/token', {
    schema: {
      tags: ['Security'],
      summary: 'Check token security via GoPlus',
      body: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          chain: { type: 'string', default: 'ethereum' },
        },
        required: ['address'],
      },
    },
    handler: async (request) => {
      const { address, chain } = request.body as { address: string; chain?: string };
      return handleTool('get_token_security', { address, chain });
    },
  });

  server.post('/rug-check', {
    schema: {
      tags: ['Security'],
      summary: 'Check token for rug pull indicators',
      body: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          chain: { type: 'string', default: 'ethereum' },
        },
        required: ['address'],
      },
    },
    handler: async (request) => {
      const { address, chain } = request.body as { address: string; chain?: string };
      return handleTool('check_rug_indicators', { address, chain });
    },
  });

  server.post('/wallet', {
    schema: {
      tags: ['Security'],
      summary: 'Analyze a wallet address',
      body: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          chain: { type: 'string', default: 'ethereum' },
        },
        required: ['address'],
      },
    },
    handler: async (request) => {
      const { address, chain } = request.body as { address: string; chain?: string };
      return handleTool('analyze_wallet', { address, chain });
    },
  });
}
