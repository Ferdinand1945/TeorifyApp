import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '@clerk/backend'

import { env } from '../env.js'

export async function clerkJwt(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

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

