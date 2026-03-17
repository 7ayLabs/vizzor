// ---------------------------------------------------------------------------
// Notification event bus — singleton EventEmitter
// Event sources import ONLY this file to avoid circular deps.
// ---------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import type { Notification } from './types.js';

/** Payload emitted by event sources — id/read/createdAt added by NotificationService. */
export type NotificationPayload = Omit<Notification, 'id' | 'read' | 'createdAt'>;

class VizzorEventBus extends EventEmitter {}

export const eventBus = new VizzorEventBus();

/** Typed emit helper. */
export function emitNotification(payload: NotificationPayload): void {
  eventBus.emit('notification', payload);
}

/** Typed subscribe helper. */
export function onNotification(listener: (payload: NotificationPayload) => void): () => void {
  eventBus.on('notification', listener);
  return () => {
    eventBus.off('notification', listener);
  };
}
