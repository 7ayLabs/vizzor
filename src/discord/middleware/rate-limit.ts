// ---------------------------------------------------------------------------
// Per-user rate limiting for Discord bot interactions
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userLimits = new Map<string, RateLimitEntry>();

const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000; // 1 minute

/**
 * Check whether a user is within the rate limit window.
 * Returns `{ allowed: true }` if the request should proceed,
 * `{ allowed: false }` if the user has exceeded the limit.
 */
export function checkRateLimit(userId: string): { allowed: boolean } {
  const now = Date.now();
  const entry = userLimits.get(userId);

  if (!entry || now >= entry.resetAt) {
    userLimits.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false };
  }

  entry.count++;
  return { allowed: true };
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
