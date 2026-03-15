/**
 * Extends CodeQL's built-in rate-limiting recognition to cover
 * the modern scoped package @fastify/rate-limit.
 *
 * CodeQL ships with recognition for the deprecated 'fastify-rate-limit'
 * but not the current '@fastify/rate-limit'. This library adds it.
 */

import javascript
import semmle.javascript.security.dataflow.MissingRateLimiting

/**
 * Recognizes `@fastify/rate-limit` as a rate-limiting middleware,
 * matching the same pattern CodeQL uses for `fastify-rate-limit`.
 */
class ScopedFastifyRateLimiter extends MissingRateLimiting::RateLimitingMiddleware {
  ScopedFastifyRateLimiter() { this = DataFlow::moduleImport("@fastify/rate-limit") }
}
