import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'

import { env } from './env.js'
import { connectToDatabase } from './db.js'
import { clerkJwt } from './middleware/clerkJwt.js'
import { requireUser } from './middleware/requireUser.js'
import { errorHandler } from './middleware/errorHandler.js'
import categoriesRouter from './routes/categories.js'
import householdsRouter from './routes/households.js'
import spendsRouter from './routes/spends.js'
import settingsRouter from './routes/settings.js'
import summaryRouter from './routes/summary.js'
import subscriptionsRouter from './routes/subscriptions.js'

/**
 * Start the HTTP server after initializing the database and configuring middleware, routes, and error handling.
 *
 * Establishes a database connection, configures Express (security headers, CORS, JSON body limits, request logging,
 * authentication), exposes the `/health` and `/me` endpoints, mounts application routers, registers the global error
 * handler, and begins listening on the configured port.
 */
async function main() {
  await connectToDatabase()

  const app = express()
  // Avoid conditional GET 304 responses for JSON APIs (no ETags).
  app.set('etag', false)

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

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
  // Allow larger payloads only for receipt OCR uploads.
  app.use('/spends/scan-receipt', express.json({ limit: '15mb' }))
  app.use('/spends/scan-attachment', express.json({ limit: '25mb' }))
  app.use('/spends/upload-attachment', express.json({ limit: '25mb' }))
  app.use(express.json({ limit: '1mb' }))
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  // Verifies Clerk Bearer tokens and sets req.auth.userId
  app.use(clerkJwt)

  // Local dev attachment storage (served from the API).
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  app.get('/me', requireUser, (req, res) => {
    res.json({ userId: req.userId ?? req.auth?.userId ?? null })
  })

  app.use('/subscriptions', subscriptionsRouter)
  app.use('/households', householdsRouter)
  app.use('/categories', categoriesRouter)
  app.use('/spends', spendsRouter)
  app.use('/settings', settingsRouter)
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

