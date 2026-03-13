// ---------------------------------------------------------------------------
// Per-user rate limiting middleware for Telegram bot
// ---------------------------------------------------------------------------

import type { Context, NextFunction } from 'grammy';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userLimits = new Map<number, RateLimitEntry>();

const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000; // 1 minute

/**
 * Rate-limiting middleware. Limits each user to MAX_REQUESTS per WINDOW_MS.
 * Silently drops excess messages to prevent abuse.
 */
export async function rateLimitMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await next();
    return;
  }

  const now = Date.now();
  const entry = userLimits.get(userId);

  if (!entry || now >= entry.resetAt) {
    userLimits.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    await next();
    return;
  }

  if (entry.count >= MAX_REQUESTS) {
    await ctx.reply('Rate limited. Please wait a moment before sending more commands.');
    return;
  }

  entry.count++;
  await next();
}

/**
 * Clean up expired entries periodically to prevent memory leaks.
 */
export function startRateLimitCleanup(intervalMs = 300_000): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of userLimits) {
      if (now >= entry.resetAt) {
        userLimits.delete(userId);
      }
    }
  }, intervalMs);
}
