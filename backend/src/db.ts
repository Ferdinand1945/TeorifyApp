import mongoose from 'mongoose'

import { env } from './env.js'

/**
 * Establishes a Mongoose connection using the configured MongoDB URI and enables strict query mode.
 *
 * After a successful connection, logs the connection's `host`, `name`, and `readyState` to the console.
 */
export async function connectToDatabase() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(env.MONGODB_URI)

  const { host, name, readyState } = mongoose.connection
  // eslint-disable-next-line no-console
  console.log('[db] connected', { host, name, readyState })
}

