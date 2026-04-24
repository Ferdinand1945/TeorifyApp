import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

/**
 * Express error-handling middleware that converts different error values into JSON HTTP responses.
 *
 * Maps error types to responses:
 * - ZodError -> HTTP 400 with `{ error: 'VALIDATION_ERROR', issues }`
 * - Error -> HTTP 500 with `{ error: 'INTERNAL_SERVER_ERROR', message }`
 * - other values -> HTTP 500 with `{ error: 'INTERNAL_SERVER_ERROR', message: 'Unknown error' }`
 *
 * @param err - The caught error; may be a `ZodError`, a standard `Error`, or any other value.
 * @param res - Express response used to send the JSON error response.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Log the original error for debugging (especially in dev).
  // eslint-disable-next-line no-console
  console.error(err)

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      issues: err.issues,
    })
  }

  if (err instanceof Error) {
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message,
    })
  }

  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Unknown error',
  })
}

