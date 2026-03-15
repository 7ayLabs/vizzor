/**
 * @name Fastify scoped rate-limit recognition
 * @description Extends CodeQL's rate-limiting detection to recognize
 *              @fastify/rate-limit (the current scoped npm package).
 *              CodeQL only ships recognition for the deprecated
 *              'fastify-rate-limit' package name.
 * @kind problem
 * @id vizzor/fastify-rate-limit-noop
 * @severity info
 */

import javascript

// This query exists solely so the companion .qll library is loaded.
// It will never produce results.
from File f
where f.getAbsolutePath() = "nonexistent-sentinel-file"
select f, "no-op"
