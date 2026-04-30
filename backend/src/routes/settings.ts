import { Router } from 'express'

import { requireUser } from '../middleware/requireUser.js'
import { UserSettingsModel } from '../models/UserSettings.js'

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
        monthlyIncomeCents: monthlyIncomeCents === undefined ? null : monthlyIncomeCents,
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

export default router

