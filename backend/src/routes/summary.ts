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

/**
 * Load expense spends for a user within an inclusive date range.
 *
 * @param userId - The user's identifier.
 * @param start - Start of the date range (inclusive) for `occurredAt`.
 * @param end - End of the date range (inclusive) for `occurredAt`.
 * @returns An array of spend documents of type `expense` that match `userId` and whose `occurredAt` falls between `start` and `end`.
 */
async function loadSpendsInRange(userId: string, start: Date, end: Date) {
  return SpendModel.find({
    userId,
    occurredAt: { $gte: start, $lte: end },
    type: 'expense',
  }).lean()
}

/**
 * Load active subscriptions for a user.
 *
 * @param userId - ID of the user whose active subscriptions to load
 * @returns Active subscription documents for the user as plain objects
 */
async function loadActiveSubscriptions(userId: string) {
  return SubscriptionModel.find({ userId, isActive: true }).lean()
}

/**
 * Compute total cents per currency from an array of spend records.
 *
 * Each spend's `currency` is normalized to an uppercase code (defaults to `'USD'` when missing)
 * and its `amountCents` (defaults to `0` when missing or falsy) is added to that currency's running sum.
 *
 * @param spends - Array of spend-like objects; each may include `currency` and `amountCents`
 * @returns A Map mapping uppercase currency codes to the summed amount in cents
 */
function spendsByCurrency(spends: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of spends) {
    const cur = String((s as any).currency || 'USD').toUpperCase()
    const amt = Number((s as any).amountCents || 0)
    map.set(cur, (map.get(cur) || 0) + amt)
  }
  return map
}

/**
 * Computes total monthly-equivalent cents per currency from active subscription records.
 *
 * @param subs - Array of subscription-like objects; each may include `currency`, `amountCents`, and `billingCycle` (`'weekly' | 'monthly' | 'yearly'`).
 * @returns A Map whose keys are uppercase currency codes and whose values are the summed monthly-equivalent cents for that currency. Missing `currency` defaults to `'USD'` and missing `amountCents` defaults to `0`. Weekly amounts are converted by multiplying by `WEEKS_PER_MONTH`, yearly amounts are converted by dividing by `12`, and monthly amounts are used as-is.
 */
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

/**
 * Produce a sorted array of unique currency keys present in either of two maps.
 *
 * @param a - Map whose keys are currency identifiers (e.g., "USD")
 * @param b - Map whose keys are currency identifiers (e.g., "EUR")
 * @returns An array of unique currency keys from `a` and `b`, sorted lexicographically
 */
function mergeCurrencyKeys(a: Map<string, number>, b: Map<string, number>) {
  return Array.from(new Set([...a.keys(), ...b.keys()])).sort()
}

/**
 * Builds per-currency totals by combining expense spends with subscription recurring equivalents for a requested period.
 *
 * @param spendsMap - Map from currency code (upper-case) to total expense cents for that currency
 * @param monthlySubsMap - Map from currency code (upper-case) to subscriptions' monthly-equivalent cents for that currency
 * @param recurringMode - Target period for recurring amounts: `'week'`, `'month'`, or `'year'`
 * @returns An array of TotalsRow where each element includes `currency`, `spendsTotalCents`, `recurringCents` (converted to the requested period), `totalCents`, and — when `recurringMode` is `'month'` — `subscriptionsMonthlyEquivalentCents` representing the monthly-equivalent subscription cents
 */
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

/**
 * Compute the Monday–Sunday week bounds that contain a given date.
 *
 * @param d - A dayjs date within the desired week
 * @returns An object with `start` set to the week's Monday at start-of-day and `end` set to the week's Sunday at end-of-day
 */
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
