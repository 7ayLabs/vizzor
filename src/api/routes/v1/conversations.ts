// ---------------------------------------------------------------------------
// Conversation API routes — /v1/conversations/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import {
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  updateConversationTitle,
} from '../../../data/conversations.js';

export async function registerConversationRoutes(server: FastifyInstance): Promise<void> {
  // GET /v1/conversations — list all conversations
  server.get('/conversations', {
    schema: {
      tags: ['Conversations'],
      summary: 'List all conversations sorted by most recent',
    },
    handler: async () => {
      return getConversations();
    },
  });

  // GET /v1/conversations/:id — get full conversation with messages
  server.get('/conversations/:id', {
    schema: {
      tags: ['Conversations'],
      summary: 'Get a conversation with all its messages',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const conv = getConversation(id);
      if (!conv) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }
      return conv;
    },
  });

  // POST /v1/conversations — create a new conversation
  server.post('/conversations', {
    schema: {
      tags: ['Conversations'],
      summary: 'Create a new conversation',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const body = request.body as { title?: string } | undefined;
      const title = body?.title ?? 'New conversation';
      const id = createConversation(title);
      return { id, title };
    },
  });

  // DELETE /v1/conversations/:id — delete a conversation
  server.delete('/conversations/:id', {
    schema: {
      tags: ['Conversations'],
      summary: 'Delete a conversation and all its messages',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: async (request) => {
      const { id } = request.params as { id: string };
      deleteConversation(id);
      return { ok: true };
    },
  });

  // PATCH /v1/conversations/:id — update conversation title
  server.patch('/conversations/:id', {
    schema: {
      tags: ['Conversations'],
      summary: 'Update conversation title',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      },
    },
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const { title } = request.body as { title: string };
      updateConversationTitle(id, title);
      return { ok: true };
    },
  });
}
