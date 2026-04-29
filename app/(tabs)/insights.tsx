import { SafeScreen } from '@/components/SafeScreen'
import { useAuthedFetch } from '@/hooks/useAuthedFetch'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@clerk/expo'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'

type Period = 'week' | 'month' | 'year'

type TotalsRow = {
  currency: string
  spendsTotalCents: number
  recurringCents?: number
  subscriptionsMonthlyEquivalentCents?: number
  totalCents: number
}

type SummaryResponse = {
  period: Period
  label?: string
  month?: string
  range?: { start: string; end: string }
  totals: TotalsRow[]
}

/**
 * Get the recurring amount (in cents) for a totals row, using fallback values when necessary.
 *
 * @param t - The totals row for a single currency
 * @returns The recurring amount in cents from `t.recurringCents`, or `t.subscriptionsMonthlyEquivalentCents` if that is absent, or `0` if neither is present
 */
function recurringCents(t: TotalsRow): number {
  return t.recurringCents ?? t.subscriptionsMonthlyEquivalentCents ?? 0
}

const periodLabel: Record<Period, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
}

const recurringHint: Record<Period, string> = {
  week: 'Subscriptions (weekly share of monthly cost)',
  month: 'Subscriptions (monthly equivalent)',
  year: 'Subscriptions (annualized from monthly)',
}

const Insights = () => {
  const authedFetch = useAuthedFetch()
  const { isLoaded, isSignedIn } = useAuth()

  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(() => dayjs())
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const queryKey = useMemo(() => {
    if (period === 'week') return `/summary/week?date=${anchor.format('YYYY-MM-DD')}`
    if (period === 'month') return `/summary/month?month=${anchor.format('YYYY-MM')}`
    return `/summary/year?year=${anchor.format('YYYY')}`
  }, [anchor, period])

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await authedFetch(queryKey)
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Request failed (${res.status})`)
      }
      const json = (await res.json()) as SummaryResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [authedFetch, queryKey])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setData(null)
      setLoading(false)
      setError('Please sign in to view insights.')
      return
    }
    setLoading(true)
    load()
  }, [isLoaded, isSignedIn, load])

  const onRefresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [isLoaded, isSignedIn, load])

  const headerLabel = useMemo(() => {
    if (!data) return ''
    if (data.label) return data.label
    if (data.month) return dayjs(`${data.month}-01`).format('MMMM YYYY')
    return ''
  }, [data])

  const goPrev = () => {
    if (period === 'week') setAnchor((a) => a.subtract(7, 'day'))
    else if (period === 'month') setAnchor((a) => a.subtract(1, 'month'))
    else setAnchor((a) => a.subtract(1, 'year'))
  }

  const goNext = () => {
    if (period === 'week') setAnchor((a) => a.add(7, 'day'))
    else if (period === 'month') setAnchor((a) => a.add(1, 'month'))
    else setAnchor((a) => a.add(1, 'year'))
  }

  const setPeriodAndResetAnchor = (p: Period) => {
    setPeriod(p)
    setAnchor(dayjs())
  }

  const grandTotalByCurrency = data?.totals ?? []

  return (
    <SafeScreen className="flex-1 bg-background p-5">
      <Text className="text-xl font-semibold text-black mb-1">Insights</Text>
      <Text className="text-sm text-gray-600 mb-5">
        Spending and recurring subscriptions for the period you select.
      </Text>

      <View className="flex-row rounded-2xl bg-white p-1 mb-4">
        {(['week', 'month', 'year'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriodAndResetAnchor(p)}
            className={
              period === p
                ? 'flex-1 rounded-xl bg-primary py-2.5'
                : 'flex-1 rounded-xl py-2.5'
            }
          >
            <Text
              className={
                period === p
                  ? 'text-center text-sm font-semibold text-white'
                  : 'text-center text-sm font-semibold text-gray-700'
              }
            >
              {periodLabel[p]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row items-center justify-between mb-4 rounded-2xl bg-white px-2 py-2">
        <Pressable onPress={goPrev} hitSlop={12} className="h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <Text className="text-lg text-black">‹</Text>
        </Pressable>
        <Text className="flex-1 px-2 text-center text-base font-semibold text-black" numberOfLines={2}>
          {headerLabel || '—'}
        </Text>
        <Pressable onPress={goNext} hitSlop={12} className="h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <Text className="text-lg text-black">›</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator />
          <Text className="mt-3 text-sm text-gray-500">Loading…</Text>
        </View>
      ) : error ? (
        <Text className="text-center text-sm text-gray-600">{error}</Text>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {grandTotalByCurrency.length === 0 ? (
            <Text className="text-center text-sm text-gray-500 py-8">No totals for this period.</Text>
          ) : (
            <View className="gap-4 pb-8">
              {grandTotalByCurrency.map((row) => {
                const spend = row.spendsTotalCents / 100
                const recurring = recurringCents(row) / 100
                const total = row.totalCents / 100
                return (
                  <View key={row.currency} className="rounded-2xl border border-border bg-card p-4">
                    <Text className="text-sm font-semibold text-gray-500 mb-3">{row.currency}</Text>
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-base text-black">Spends</Text>
                        <Text className="text-base font-semibold text-black">{formatCurrency(spend, row.currency)}</Text>
                      </View>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-base text-black flex-1 pr-2" numberOfLines={2}>
                          {recurringHint[period]}
                        </Text>
                        <Text className="text-base font-semibold text-black">
                          {formatCurrency(recurring, row.currency)}
                        </Text>
                      </View>
                      <View className="my-2 h-px bg-border" />
                      <View className="flex-row items-center justify-between">
                        <Text className="text-lg font-bold text-black">Total</Text>
                        <Text className="text-lg font-bold text-black">{formatCurrency(total, row.currency)}</Text>
                      </View>
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeScreen>
  )
}

export default Insights
