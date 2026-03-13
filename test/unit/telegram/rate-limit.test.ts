import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimitMiddleware } from '@/telegram/middleware/rate-limit.js';

// ---------------------------------------------------------------------------
// Minimal Context mock
// ---------------------------------------------------------------------------

function makeCtx(userId: number) {
  return {
    from: { id: userId },
    reply: vi.fn(),
  } as unknown as Parameters<typeof rateLimitMiddleware>[0];
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('calls next for normal requests', async () => {
    const ctx = makeCtx(1001);
    const next = vi.fn();
    await rateLimitMiddleware(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows up to 10 requests per minute', async () => {
    const next = vi.fn();
    for (let i = 0; i < 10; i++) {
      await rateLimitMiddleware(makeCtx(2001), next);
    }
    expect(next).toHaveBeenCalledTimes(10);
  });

  it('blocks the 11th request in same window', async () => {
    const next = vi.fn();
    const ctx = makeCtx(3001);
    for (let i = 0; i < 11; i++) {
      await rateLimitMiddleware(ctx, next);
    }
    // 10 allowed, 11th blocked
    expect(next).toHaveBeenCalledTimes(10);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Rate limited'));
  });

  it('resets after window expires', async () => {
    const next = vi.fn();
    const ctx = makeCtx(4001);

    // Use up all requests
    for (let i = 0; i < 10; i++) {
      await rateLimitMiddleware(ctx, next);
    }
    expect(next).toHaveBeenCalledTimes(10);

    // Advance past the 60s window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again
    await rateLimitMiddleware(ctx, next);
    expect(next).toHaveBeenCalledTimes(11);
  });

  it('tracks users independently', async () => {
    const next = vi.fn();
    await rateLimitMiddleware(makeCtx(5001), next);
    await rateLimitMiddleware(makeCtx(5002), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
