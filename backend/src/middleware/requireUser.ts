import type { Request, Response, NextFunction } from 'express'

/**
 * After Clerk middleware runs, `req.auth` exists when a Bearer token is valid.
 * We enforce that every request has a `userId` and attach it for convenience.
 */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const userId = req.auth?.userId
  if (!userId) {
    const authHeader = req.headers.authorization
    const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    let tokenClaims: Record<string, unknown> | undefined
    if (bearer) {
      try {
        const parts = bearer.split('.')
        if (parts.length >= 2) {
          const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
          tokenClaims = JSON.parse(payload) as Record<string, unknown>
        }
      } catch {
        // ignore decode errors
      }
    }
    // eslint-disable-next-line no-console
    console.warn('[auth] unauthorized', {
      hasAuthorizationHeader: Boolean(authHeader),
      authorizationPrefix: authHeader?.slice(0, 20),
      tokenIss: tokenClaims?.iss,
      tokenAzp: tokenClaims?.azp,
      tokenAud: tokenClaims?.aud,
    })
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      reason: authHeader ? 'INVALID_OR_MISSING_SESSION' : 'MISSING_AUTHORIZATION_HEADER',
    })
  }

  ;(req as Request & { userId: string }).userId = userId
  next()
}

