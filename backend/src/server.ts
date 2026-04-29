import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { env } from './env.js'
import { connectToDatabase } from './db.js'
import { clerkJwt } from './middleware/clerkJwt.js'
import { requireUser } from './middleware/requireUser.js'
import { errorHandler } from './middleware/errorHandler.js'
import categoriesRouter from './routes/categories.js'
import spendsRouter from './routes/spends.js'
import summaryRouter from './routes/summary.js'
import subscriptionsRouter from './routes/subscriptions.js'

/**
 * Initialize and start the HTTP server by connecting to the database, configuring middleware, registering routes, and installing global error handling.
 *
 * Configures security headers, CORS, JSON body parsing (with an increased request size limit), request logging, and authentication middleware; exposes the `/health` and `/me` endpoints; mounts the `subscriptions`, `categories`, `spends`, and `summary` routers; and begins listening on the configured port.
 */
async function main() {
  await connectToDatabase()

  const app = express()
  // Avoid conditional GET 304 responses for JSON APIs (no ETags).
  app.set('etag', false)

  app.use(helmet())
  const allowedOrigins = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    }),
  )
  // Receipts are sent as base64-encoded images (can exceed 1mb).
  app.use(express.json({ limit: '15mb' }))
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  // Verifies Clerk Bearer tokens and sets req.auth.userId
  app.use(clerkJwt)

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.get('/me', requireUser, (req, res) => {
    res.json({ userId: req.userId ?? req.auth?.userId ?? null })
  })

  app.use('/subscriptions', subscriptionsRouter)
  app.use('/categories', categoriesRouter)
  app.use('/spends', spendsRouter)
  app.use('/summary', summaryRouter)

  app.use(errorHandler)

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on :${env.PORT}`)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

