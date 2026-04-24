import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

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

