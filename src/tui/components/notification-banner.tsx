// ---------------------------------------------------------------------------
// NotificationBanner — toast overlay for TUI notifications
// ---------------------------------------------------------------------------

import React from 'react';
import { Box, Text } from 'ink';
import type { Notification } from '../../notifications/types.js';

interface NotificationBannerProps {
  notification: Notification | null;
  onDismiss: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'cyan',
  warning: 'yellow',
  critical: 'red',
};

export function NotificationBanner({
  notification,
  onDismiss: _onDismiss,
}: NotificationBannerProps): React.JSX.Element | null {
  if (!notification) return null;

  const color = SEVERITY_COLORS[notification.severity] ?? 'cyan';

  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} marginY={0} flexDirection="column">
      <Box gap={1}>
        <Text color={color} bold>
          {notification.severity === 'critical' ? '\u26A0' : '\u25CF'} {notification.title}
        </Text>
        {notification.symbol && <Text dimColor>[{notification.symbol}]</Text>}
      </Box>
      <Text wrap="wrap">{notification.message}</Text>
    </Box>
  );
}
