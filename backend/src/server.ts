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
import subscriptionsRouter from './routes/subscriptions.js'

/**
 * Initialize the application: connect to the database, configure middleware, register routes, and start the HTTP server.
 *
 * Sets up security, CORS, JSON body parsing, request logging, and authentication middleware; exposes the `/health`
 * and `/me` endpoints; mounts the subscriptions and categories routers; registers a global error handler; and begins
 * listening on the configured port.
 */
async function main() {
  await connectToDatabase()

  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  // Verifies Clerk Bearer tokens and sets req.auth.userId
  app.use(clerkJwt)

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.get('/me', requireUser, (req, res) => {
    res.json({ userId: req.userId ?? req.auth?.userId ?? null })
  })

  app.use('/subscriptions', subscriptionsRouter)
  app.use('/categories', categoriesRouter)

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

