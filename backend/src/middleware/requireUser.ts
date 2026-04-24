import type { Request, Response, NextFunction } from 'express'

/**
 * Ensures the request has an authenticated user ID; if present attaches it to `req.userId` and continues, otherwise responds with HTTP 401.
 *
 * If `req.auth?.userId` is missing the middleware inspects the `Authorization` header and (when present) attempts to decode the JWT payload to extract claim values for logging. It logs a warning with header and available token claim metadata, then responds with JSON `{ error: 'UNAUTHORIZED', reason: 'INVALID_OR_MISSING_SESSION' }` when an authorization header exists, or `{ error: 'UNAUTHORIZED', reason: 'MISSING_AUTHORIZATION_HEADER' }` when it does not.
 *
 * Side effects:
 * - On success, assigns `userId` to `req.userId` and calls `next()`.
 * - On failure, sends a 401 response and does not call `next()`.
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

