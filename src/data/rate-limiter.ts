/**
 * A token-bucket rate limiter that controls throughput by requiring callers
 * to acquire tokens before proceeding.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private lastRefill: number;

  /**
   * @param maxTokens   Maximum number of tokens the bucket can hold.
   * @param refillRate  Rate at which tokens are added, in tokens per second.
   */
  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Acquires the specified number of tokens, waiting if the bucket does not
   * have enough available. Resolves once the tokens have been consumed.
   */
  async acquire(cost = 1): Promise<void> {
    this.refill();

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return;
    }

    const deficit = cost - this.tokens;
    const waitMs = (deficit / this.refillRate) * 1000;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, waitMs);
    });

    this.refill();
    this.tokens -= cost;
  }

  /**
   * Refills tokens based on elapsed time since the last refill.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}
