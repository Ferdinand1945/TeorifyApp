declare global {
  namespace Express {
    // Clerk attaches `auth` to the request after `clerkMiddleware()`
    interface Request {
      auth?: {
        userId?: string | null
        sessionId?: string | null
        orgId?: string | null
        orgRole?: string | null
        orgSlug?: string | null
      }
      userId?: string
    }
  }
}

export {}

