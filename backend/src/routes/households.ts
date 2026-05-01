import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'

import { requireUser } from '../middleware/requireUser.js'
import { HouseholdModel } from '../models/Household.js'
import { UserSettingsModel } from '../models/UserSettings.js'

const router = Router()

router.use(requireUser)

const createSchema = z.object({
  name: z.string().min(1).max(120),
})

const joinSchema = z.object({
  code: z.string().min(4).max(32),
})

function makeJoinCode() {
  // 10 chars, URL-safe-ish, easy to type.
  return crypto.randomBytes(6).toString('base64url').toUpperCase()
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const userId = req.userId!
  const items = await HouseholdModel.find({ memberUserIds: userId }).sort({ createdAt: -1 }).lean()
  res.json({ items })
})

router.post('/', async (req, res) => {
  const userId = req.userId!
  const data = createSchema.parse(req.body)

  // Low-contention retry loop for unique joinCode.
  let joinCode = makeJoinCode()
  for (let i = 0; i < 5; i++) {
    const exists = await HouseholdModel.exists({ joinCode })
    if (!exists) break
    joinCode = makeJoinCode()
  }

  const doc = await HouseholdModel.create({
    name: data.name.trim(),
    joinCode,
    memberUserIds: [userId],
    createdByUserId: userId,
  })

  // Convenience: switch active household to the newly created one.
  await UserSettingsModel.findOneAndUpdate(
    { userId },
    { $set: { activeHouseholdId: String((doc as any)._id) }, $setOnInsert: { userId } },
    { upsert: true },
  )

  res.status(201).json({ item: doc.toObject() })
})

router.post('/join', async (req, res) => {
  const userId = req.userId!
  const data = joinSchema.parse(req.body)
  const code = data.code.trim().toUpperCase()

  const hh = await HouseholdModel.findOneAndUpdate(
    { joinCode: code },
    { $addToSet: { memberUserIds: userId } },
    { new: true },
  )
  if (!hh) return res.status(404).json({ error: 'HOUSEHOLD_NOT_FOUND' })

  await UserSettingsModel.findOneAndUpdate(
    { userId },
    { $set: { activeHouseholdId: String((hh as any)._id) }, $setOnInsert: { userId } },
    { upsert: true },
  )

  res.json({ item: hh.toObject() })
})

export default router

