// ---------------------------------------------------------------------------
// Notification module — barrel export
// ---------------------------------------------------------------------------

export {
  initNotificationService,
  registerTUICallback,
  setChannels,
  getNotificationConfig,
} from './service.js';
export { eventBus, emitNotification, onNotification } from './event-bus.js';
export type { NotificationPayload } from './event-bus.js';
export type {
  Notification,
  AlertRule,
  NotificationEventType,
  NotificationSeverity,
  NotificationChannels,
  NotificationConfig,
} from './types.js';
export {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  insertAlertRule,
  getAlertRules,
  updateAlertRule,
  deleteAlertRule,
} from './store.js';
