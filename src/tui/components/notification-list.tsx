// ---------------------------------------------------------------------------
// NotificationList — scrollable list for /alerts command output
// ---------------------------------------------------------------------------

import React from 'react';
import { Box, Text } from 'ink';
import type { Notification } from '../../notifications/types.js';

interface NotificationListProps {
  notifications: Notification[];
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'cyan',
  warning: 'yellow',
  critical: 'red',
};

export function NotificationList({ notifications }: NotificationListProps): React.JSX.Element {
  if (notifications.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>No notifications.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {notifications.map((n) => {
        const color = SEVERITY_COLORS[n.severity] ?? 'cyan';
        const time = new Date(n.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const unreadMark = n.read ? ' ' : '*';

        return (
          <Box key={n.id} gap={1}>
            <Text dimColor>{time}</Text>
            <Text color={color}>{unreadMark}</Text>
            <Text color={color} bold>
              [{n.severity.toUpperCase().charAt(0)}]
            </Text>
            <Text bold>{n.title}</Text>
            <Text wrap="truncate-end">{n.message}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Format notifications as plain text for command output.
 */
export function formatNotificationText(notifications: Notification[]): string {
  if (notifications.length === 0) return 'No notifications.';

  return notifications
    .map((n) => {
      const time = new Date(n.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const unread = n.read ? ' ' : '*';
      return `${unread} ${time}  [${n.severity.toUpperCase().charAt(0)}] ${n.title} — ${n.message}`;
    })
    .join('\n');
}
