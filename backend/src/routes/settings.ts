import { Router } from 'express'
import mongoose from 'mongoose'

import { requireUser } from '../middleware/requireUser.js'
import { UserSettingsModel } from '../models/UserSettings.js'
import { HouseholdModel } from '../models/Household.js'

const router = Router()

router.use(requireUser)

/**
 * GET /settings/monthly-income
 * Returns the saved monthly income for the authenticated user.
 */
router.get('/monthly-income', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const userId = req.userId!

  const settings = await UserSettingsModel.findOne({ userId }).lean()
  res.json({
    monthlyIncomeCents: settings?.monthlyIncomeCents ?? null,
    currency: settings?.monthlyIncomeCurrency ?? null,
  })
})

/**
 * PUT /settings/monthly-income
 * Body: { monthlyIncomeCents: number|null, currency?: string|null }
 */
router.put('/monthly-income', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const userId = req.userId!

  const monthlyIncomeCents = (req.body as any)?.monthlyIncomeCents
  const currency = (req.body as any)?.currency

  if (monthlyIncomeCents !== null && monthlyIncomeCents !== undefined) {
    const n = Number(monthlyIncomeCents)
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'INVALID_MONTHLY_INCOME' })
  }

  const validatedIncomeCents =
    monthlyIncomeCents === null || monthlyIncomeCents === undefined
      ? null
      : Number(monthlyIncomeCents)

  if (currency !== null && currency !== undefined) {
    if (typeof currency !== 'string' || currency.trim().length === 0 || currency.trim().length > 12) {
      return res.status(400).json({ error: 'INVALID_CURRENCY' })
    }
  }

  const normalizedCurrency =
    typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : null

  const updated = await UserSettingsModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        monthlyIncomeCents: validatedIncomeCents,
        monthlyIncomeCurrency: normalizedCurrency,
      },
      $setOnInsert: { userId },
    },
    { upsert: true, new: true },
  ).lean()

  res.json({
    monthlyIncomeCents: updated?.monthlyIncomeCents ?? null,
    currency: updated?.monthlyIncomeCurrency ?? null,
  })
})

/**
 * GET /settings/active-household
 * Returns the active household for the authenticated user (or null).
 */
router.get('/active-household', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const userId = req.userId!
  const settings = await UserSettingsModel.findOne({ userId }).lean()
  res.json({ householdId: (settings as any)?.activeHouseholdId ?? null })
})

/**
 * PUT /settings/active-household
 * Body: { householdId: string|null }
 */
router.put('/active-household', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const userId = req.userId!

  const householdId = (req.body as any)?.householdId
  if (householdId !== null && householdId !== undefined) {
    if (typeof householdId !== 'string' || !mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ error: 'INVALID_HOUSEHOLD_ID' })
    }
    const hh = await HouseholdModel.findOne({ _id: householdId, memberUserIds: userId }).lean()
    if (!hh) return res.status(404).json({ error: 'HOUSEHOLD_NOT_FOUND' })
  }

  const updated = await UserSettingsModel.findOneAndUpdate(
    { userId },
    { $set: { activeHouseholdId: householdId ?? null }, $setOnInsert: { userId } },
    { upsert: true, new: true },
  ).lean()

  res.json({ householdId: (updated as any)?.activeHouseholdId ?? null })
})

export default router

