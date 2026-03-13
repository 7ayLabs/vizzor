import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '@/data/rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within capacity', async () => {
    const limiter = new TokenBucketRateLimiter(5, 1);
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    // Should not throw
  });

  it('creates limiter with given capacity and rate', () => {
    const limiter = new TokenBucketRateLimiter(10, 2);
    expect(limiter).toBeDefined();
  });

  it('acquire resolves immediately when tokens available', async () => {
    const limiter = new TokenBucketRateLimiter(3, 1);
    // Should resolve without waiting
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
  });

  it('acquire waits when tokens exhausted', async () => {
    const limiter = new TokenBucketRateLimiter(1, 1);
    await limiter.acquire(); // use the only token

    const promise = limiter.acquire(); // should wait
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    // Not resolved yet
    expect(resolved).toBe(false);

    // Advance time to allow refill
    await vi.advanceTimersByTimeAsync(1100);

    await promise;
    // Now it should have resolved
  });

  it('supports custom cost per acquire', async () => {
    const limiter = new TokenBucketRateLimiter(5, 1);
    await limiter.acquire(3); // uses 3 tokens
    await limiter.acquire(2); // uses remaining 2
    // bucket should be empty now
  });
});
