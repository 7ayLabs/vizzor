import pino from 'pino';
import type { Logger } from 'pino';

const level = process.env['VIZZOR_LOG_LEVEL'] ?? 'info';

/**
 * Creates a named Pino logger instance.
 * Uses pino-pretty transport when NODE_ENV is not 'production'.
 */
export function createLogger(name: string): Logger {
  const isDev = process.env['NODE_ENV'] !== 'production';

  if (isDev) {
    return pino({
      name,
      level,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    });
  }

  return pino({ name, level });
}
