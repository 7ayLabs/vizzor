// ---------------------------------------------------------------------------
// WebSocket server for real-time push events
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import websocket from '@fastify/websocket';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ws-server');

/** Minimal socket interface matching what @fastify/websocket provides */
interface WSSocket {
  send(data: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

interface WSClient {
  id: string;
  socket: WSSocket;
  channels: Set<string>;
  authenticated: boolean;
}

const clients = new Map<string, WSClient>();
let clientCounter = 0;

/**
 * Available channels:
 * - price:{symbol}        — Real-time price updates
 * - agent:{id}:decision   — Agent decision events
 * - trenches:alerts       — New token migration alerts
 * - ml:prediction         — ML prediction results
 */

export function broadcast(channel: string, data: unknown): void {
  const payload = JSON.stringify({ channel, data, timestamp: Date.now() });
  for (const client of clients.values()) {
    if (client.authenticated && client.channels.has(channel)) {
      try {
        client.socket.send(payload);
      } catch {
        // Client disconnected, will be cleaned up
      }
    }
  }
}

export function broadcastAll(data: unknown): void {
  const payload = JSON.stringify({ channel: 'system', data, timestamp: Date.now() });
  for (const client of clients.values()) {
    if (client.authenticated) {
      try {
        client.socket.send(payload);
      } catch {
        // Will be cleaned up
      }
    }
  }
}

export function getConnectedClients(): number {
  return clients.size;
}

export const wsPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(websocket);

  fastify.get('/ws', { websocket: true }, (socket, _request) => {
    const id = `ws-${++clientCounter}`;
    const ws = socket as unknown as WSSocket;
    const client: WSClient = {
      id,
      socket: ws,
      channels: new Set(),
      authenticated: false,
    };
    clients.set(id, client);
    log.info(`WebSocket client connected: ${id}`);

    ws.on('message', (raw: unknown) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type: string;
          apiKey?: string;
          channels?: string[];
        };

        if (msg.type === 'auth' && msg.apiKey) {
          client.authenticated = true;
          ws.send(JSON.stringify({ type: 'auth', status: 'ok' }));
        }

        if (msg.type === 'subscribe' && msg.channels && client.authenticated) {
          for (const ch of msg.channels) {
            client.channels.add(ch);
          }
          ws.send(JSON.stringify({ type: 'subscribed', channels: [...client.channels] }));
        }

        if (msg.type === 'unsubscribe' && msg.channels) {
          for (const ch of msg.channels) {
            client.channels.delete(ch);
          }
        }
      } catch {
        // Invalid message, ignore
      }
    });

    ws.on('close', () => {
      clients.delete(id);
      log.info(`WebSocket client disconnected: ${id}`);
    });
  });

  log.info('WebSocket server registered at /ws');
};
