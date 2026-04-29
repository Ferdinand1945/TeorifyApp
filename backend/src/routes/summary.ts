import { Router } from 'express'
import dayjs from 'dayjs'

import { requireUser } from '../middleware/requireUser.js'
import { SpendModel } from '../models/Spend.js'
import { SubscriptionModel } from '../models/Subscription.js'

const router = Router()

router.use(requireUser)

/** Average weeks per month (used to convert monthly subscription burn to weekly). */
const WEEKS_PER_MONTH = 4.34524

type TotalsRow = {
  currency: string
  spendsTotalCents: number
  /** Recurring (subscriptions) expressed for the selected period: weekly / monthly / yearly equivalent. */
  recurringCents: number
  totalCents: number
  /** Present for `/summary/month` backward compatibility (same as monthly recurring). */
  subscriptionsMonthlyEquivalentCents?: number
}

async function loadSpendsInRange(userId: string, start: Date, end: Date) {
  return SpendModel.find({
    userId,
    occurredAt: { $gte: start, $lte: end },
    type: 'expense',
  }).lean()
}

async function loadActiveSubscriptions(userId: string) {
  return SubscriptionModel.find({ userId, isActive: true }).lean()
}

function spendsByCurrency(spends: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of spends) {
    const cur = String((s as any).currency || 'USD').toUpperCase()
    const amt = Number((s as any).amountCents || 0)
    map.set(cur, (map.get(cur) || 0) + amt)
  }
  return map
}

/** Monthly-equivalent cents per currency for active subscriptions. */
function subscriptionsMonthlyEquivalentByCurrency(subs: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of subs) {
    const cur = String((s as any).currency || 'USD').toUpperCase()
    const amt = Number((s as any).amountCents || 0)
    const cycle = String((s as any).billingCycle || 'monthly')

    let monthlyEq = amt
    if (cycle === 'weekly') monthlyEq = Math.round(amt * WEEKS_PER_MONTH)
    else if (cycle === 'yearly') monthlyEq = Math.round(amt / 12)

    map.set(cur, (map.get(cur) || 0) + monthlyEq)
  }
  return map
}

function mergeCurrencyKeys(a: Map<string, number>, b: Map<string, number>) {
  return Array.from(new Set([...a.keys(), ...b.keys()])).sort()
}

function buildTotals(
  spendsMap: Map<string, number>,
  monthlySubsMap: Map<string, number>,
  recurringMode: 'week' | 'month' | 'year',
): TotalsRow[] {
  const currencies = mergeCurrencyKeys(spendsMap, monthlySubsMap)
  return currencies.map((currency) => {
    const spendsTotalCents = spendsMap.get(currency) || 0
    const monthlyEq = monthlySubsMap.get(currency) || 0

    let recurringCents = monthlyEq
    if (recurringMode === 'week') recurringCents = Math.round(monthlyEq / WEEKS_PER_MONTH)
    else if (recurringMode === 'year') recurringCents = Math.round(monthlyEq * 12)

    const row: TotalsRow = {
      currency,
      spendsTotalCents,
      recurringCents,
      totalCents: spendsTotalCents + recurringCents,
    }
    if (recurringMode === 'month') {
      row.subscriptionsMonthlyEquivalentCents = monthlyEq
    }
    return row
  })
}

function weekBoundsContainingDate(d: dayjs.Dayjs) {
  const day = d.day()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const start = d.add(diffToMonday, 'day').startOf('day')
  const end = start.add(6, 'day').endOf('day')
  return { start, end }
}

/**
 * GET /summary/month?month=YYYY-MM
 * Returns totals grouped by currency (backward compatible + recurringCents).
 */
router.get('/month', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  const monthStr = (req.query.month as string | undefined) || dayjs().format('YYYY-MM')
  const start = dayjs(`${monthStr}-01`).startOf('month')
  const end = start.endOf('month')

  const userId = req.userId!
  const [spends, subs] = await Promise.all([
    loadSpendsInRange(userId, start.toDate(), end.toDate()),
    loadActiveSubscriptions(userId),
  ])

  const spendsMap = spendsByCurrency(spends)
  const monthlyMap = subscriptionsMonthlyEquivalentByCurrency(subs)
  const totals = buildTotals(spendsMap, monthlyMap, 'month').map((t) => ({
    ...t,
    recurringCents: t.recurringCents,
    subscriptionsMonthlyEquivalentCents: t.subscriptionsMonthlyEquivalentCents ?? 0,
  }))

  res.json({
    month: monthStr,
    period: 'month' as const,
    range: { start: start.toISOString(), end: end.toISOString() },
    totals,
  })
})

/**
 * GET /summary/week?date=YYYY-MM-DD (defaults to today)
 * Monday–Sunday week containing `date`.
 */
router.get('/week', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  const dateStr = (req.query.date as string | undefined) || dayjs().format('YYYY-MM-DD')
  const anchor = dayjs(dateStr)
  if (!anchor.isValid()) {
    return res.status(400).json({ error: 'INVALID_DATE' })
  }

  const { start, end } = weekBoundsContainingDate(anchor)
  const userId = req.userId!
  const [spends, subs] = await Promise.all([
    loadSpendsInRange(userId, start.toDate(), end.toDate()),
    loadActiveSubscriptions(userId),
  ])

  const spendsMap = spendsByCurrency(spends)
  const monthlyMap = subscriptionsMonthlyEquivalentByCurrency(subs)
  const totals = buildTotals(spendsMap, monthlyMap, 'week')

  res.json({
    period: 'week' as const,
    label: `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`,
    range: { start: start.toISOString(), end: end.toISOString() },
    totals,
  })
})

/**
 * GET /summary/year?year=YYYY (defaults to current year)
 */
router.get('/year', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')

  const yearStr = (req.query.year as string | undefined) || dayjs().format('YYYY')
  const yearNum = Number(yearStr)
  if (!Number.isFinite(yearNum) || yearNum < 1970 || yearNum > 2100) {
    return res.status(400).json({ error: 'INVALID_YEAR' })
  }

  const start = dayjs(`${yearNum}-01-01`).startOf('day')
  const end = dayjs(`${yearNum}-12-31`).endOf('day')

  const userId = req.userId!
  const [spends, subs] = await Promise.all([
    loadSpendsInRange(userId, start.toDate(), end.toDate()),
    loadActiveSubscriptions(userId),
  ])

  const spendsMap = spendsByCurrency(spends)
  const monthlyMap = subscriptionsMonthlyEquivalentByCurrency(subs)
  const totals = buildTotals(spendsMap, monthlyMap, 'year')

  res.json({
    period: 'year' as const,
    label: String(yearNum),
    range: { start: start.toISOString(), end: end.toISOString() },
    totals,
  })
})

export default router
