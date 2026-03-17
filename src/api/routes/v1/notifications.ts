// ---------------------------------------------------------------------------
// Notification & Alert API routes — /v1/notifications/*
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  insertAlertRule,
  getAlertRules,
  updateAlertRule,
  deleteAlertRule,
} from '../../../notifications/store.js';
import { randomUUID } from 'node:crypto';
import type { AlertRule } from '../../../notifications/types.js';
import { emitNotification } from '../../../notifications/event-bus.js';

export async function registerNotificationRoutes(server: FastifyInstance): Promise<void> {
  // Test endpoint — emit a notification manually
  server.post('/notifications/test', {
    schema: {
      tags: ['Notifications'],
      summary: 'Emit a test notification (for development)',
      body: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          message: { type: 'string' },
          severity: { type: 'string' },
          symbol: { type: 'string' },
        },
      },
    },
    handler: async (request) => {
      const body = request.body as Record<string, string> | undefined;
      emitNotification({
        type: (body?.type as AlertRule['type']) ?? 'custom',
        title: body?.title ?? 'Test Notification',
        message: body?.message ?? 'This is a test notification from Vizzor.',
        severity: (body?.severity as 'info' | 'warning' | 'critical') ?? 'info',
        symbol: body?.symbol,
        metadata: { test: true },
      });
      return { ok: true, message: 'Test notification emitted' };
    },
  });
  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  server.get('/notifications', {
    schema: {
      tags: ['Notifications'],
      summary: 'List notifications',
      querystring: {
        type: 'object',
        properties: {
          unread: { type: 'string', description: '"true" to show unread only' },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
      },
    },
    handler: async (request) => {
      const { unread, limit } = request.query as { unread?: string; limit?: number };
      return getNotifications({
        unreadOnly: unread === 'true',
        limit: limit ?? 50,
      });
    },
  });

  server.get('/notifications/unread/count', {
    schema: {
      tags: ['Notifications'],
      summary: 'Get unread notification count',
    },
    handler: async () => {
      return { count: getUnreadCount() };
    },
  });

  server.post('/notifications/:id/read', {
    schema: {
      tags: ['Notifications'],
      summary: 'Mark a notification as read',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: async (request) => {
      const { id } = request.params as { id: string };
      markRead(id);
      return { ok: true };
    },
  });

  server.post('/notifications/read-all', {
    schema: {
      tags: ['Notifications'],
      summary: 'Mark all notifications as read',
    },
    handler: async () => {
      markAllRead();
      return { ok: true };
    },
  });

  // -------------------------------------------------------------------------
  // Alert Rules
  // -------------------------------------------------------------------------

  server.get('/alerts', {
    schema: {
      tags: ['Alerts'],
      summary: 'List configured alert rules',
    },
    handler: async () => {
      return getAlertRules();
    },
  });

  server.post('/alerts', {
    schema: {
      tags: ['Alerts'],
      summary: 'Create a new alert rule',
      body: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          symbols: { type: 'array', items: { type: 'string' } },
          priceAbove: { type: 'number' },
          priceBelow: { type: 'number' },
          pumpSeverity: { type: 'array', items: { type: 'string' } },
          agentActions: { type: 'array', items: { type: 'string' } },
          accuracyMilestone: { type: 'number' },
        },
        required: ['type'],
      },
    },
    handler: async (request) => {
      const body = request.body as Partial<AlertRule> & { type: AlertRule['type'] };

      const rule: AlertRule = {
        id: randomUUID(),
        type: body.type,
        enabled: true,
        symbols: body.symbols,
        priceAbove: body.priceAbove,
        priceBelow: body.priceBelow,
        pumpSeverity: body.pumpSeverity,
        agentActions: body.agentActions,
        accuracyMilestone: body.accuracyMilestone,
        createdAt: Date.now(),
      };

      insertAlertRule(rule);
      return rule;
    },
  });

  server.patch('/alerts/:id', {
    schema: {
      tags: ['Alerts'],
      summary: 'Update an alert rule (toggle enabled, change thresholds)',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          symbols: { type: 'array', items: { type: 'string' } },
          priceAbove: { type: 'number' },
          priceBelow: { type: 'number' },
          pumpSeverity: { type: 'array', items: { type: 'string' } },
          agentActions: { type: 'array', items: { type: 'string' } },
          accuracyMilestone: { type: 'number' },
        },
      },
    },
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const patch = request.body as Partial<AlertRule>;
      updateAlertRule(id, patch);
      return { ok: true };
    },
  });

  server.delete('/alerts/:id', {
    schema: {
      tags: ['Alerts'],
      summary: 'Delete an alert rule',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    handler: async (request) => {
      const { id } = request.params as { id: string };
      deleteAlertRule(id);
      return { ok: true };
    },
  });
}
