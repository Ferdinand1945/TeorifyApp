import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '@clerk/backend'

import { env } from '../env.js'

/**
 * Middleware that authenticates a Bearer token from the Authorization header and attaches the resolved user id to `req.auth`.
 *
 * If no Bearer token is present, `req.auth.userId` is set to `null`. If a token is present, it is verified with Clerk using the configured secret key and a 60‑second clock skew allowance; on successful verification `req.auth.userId` is set to the token's `sub` value when that value is a string, otherwise `null`. On verification failure `req.auth.userId` is set to `null`. The middleware always calls `next()` when finished.
 */
export async function clerkJwt(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const bearer =
    typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null : null

  if (!bearer) {
    req.auth = { userId: null }
    return next()
  }

  try {
    const verified = await verifyToken(bearer, {
      secretKey: env.CLERK_SECRET_KEY,
      clockSkewInMs: 60_000,
    })

    req.auth = { userId: typeof verified.sub === 'string' ? verified.sub : null }
  } catch {
    req.auth = { userId: null }
  }

  next()
}

