import { Router } from 'express'
import dayjs from 'dayjs'

import { requireUser } from '../middleware/requireUser.js'
import { SpendModel } from '../models/Spend.js'
import { SubscriptionModel } from '../models/Subscription.js'

const router = Router()

router.use(requireUser)

/**
 * GET /summary/month?month=YYYY-MM
 * Returns totals grouped by currency:
 * - spendsTotalCents: sum of spends occurred within the month
 * - subscriptionsMonthlyEquivalentCents: monthly-equivalent burn rate for active subscriptions
 * - totalCents: spendsTotalCents + subscriptionsMonthlyEquivalentCents
 */
router.get('/month', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  const monthStr = (req.query.month as string | undefined) || dayjs().format('YYYY-MM')
  const start = dayjs(`${monthStr}-01`).startOf('month')
  const end = start.endOf('month')

  const [spends, subs] = await Promise.all([
    SpendModel.find({
      userId: req.userId,
      occurredAt: { $gte: start.toDate(), $lte: end.toDate() },
      type: 'expense',
    }).lean(),
    SubscriptionModel.find({ userId: req.userId, isActive: true }).lean(),
  ])

  const spendsByCurrency = new Map<string, number>()
  for (const s of spends) {
    const cur = String((s as any).currency || 'USD').toUpperCase()
    const amt = Number((s as any).amountCents || 0)
    spendsByCurrency.set(cur, (spendsByCurrency.get(cur) || 0) + amt)
  }

  // Convert subscriptions to monthly-equivalent (rough but useful):
  // weekly: * 4.34524 (avg weeks per month)
  // monthly: * 1
  // yearly: / 12
  const subsByCurrency = new Map<string, number>()
  for (const s of subs) {
    const cur = String((s as any).currency || 'USD').toUpperCase()
    const amt = Number((s as any).amountCents || 0)
    const cycle = String((s as any).billingCycle || 'monthly')

    let monthlyEq = amt
    if (cycle === 'weekly') monthlyEq = Math.round(amt * 4.34524)
    else if (cycle === 'yearly') monthlyEq = Math.round(amt / 12)

    subsByCurrency.set(cur, (subsByCurrency.get(cur) || 0) + monthlyEq)
  }

  const currencies = Array.from(new Set([...spendsByCurrency.keys(), ...subsByCurrency.keys()])).sort()
  const totals = currencies.map((currency) => {
    const spendsTotalCents = spendsByCurrency.get(currency) || 0
    const subscriptionsMonthlyEquivalentCents = subsByCurrency.get(currency) || 0
    return {
      currency,
      spendsTotalCents,
      subscriptionsMonthlyEquivalentCents,
      totalCents: spendsTotalCents + subscriptionsMonthlyEquivalentCents,
    }
  })

  res.json({
    month: monthStr,
    totals,
  })
})

export default router

