// ---------------------------------------------------------------------------
// Global API error handler
// ---------------------------------------------------------------------------

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error.statusCode === 429) {
    void reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again later.',
    });
    return;
  }

  const status = error.statusCode ?? 500;
  void reply.status(status).send({
    error: error.name ?? 'InternalError',
    message: status >= 500 ? 'Internal server error' : error.message,
  });
}
