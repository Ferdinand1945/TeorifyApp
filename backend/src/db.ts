import mongoose from 'mongoose'

import { env } from './env.js'

export async function connectToDatabase() {
  mongoose.set('strictQuery', true)
  await mongoose.connect(env.MONGODB_URI)

  const { host, name, readyState } = mongoose.connection
  // eslint-disable-next-line no-console
  console.log('[db] connected', { host, name, readyState })
}

