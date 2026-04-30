import DonutChart from '@/components/DonutChart'
import { SafeScreen } from '@/components/SafeScreen'
import { useAuthedFetch } from '@/hooks/useAuthedFetch'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@clerk/expo'
import { Ionicons } from '@expo/vector-icons'
import dayjs from 'dayjs'
import * as SecureStore from 'expo-secure-store'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
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

type ApiSpend = {
  _id: string
  title: string
  type: 'expense' | 'income'
  amountCents: number
  currency: string
  occurredAt: string
  categoryId?: string | null
}

type ApiCategory = {
  _id: string
  name: string
  kind: 'subscription' | 'expense' | 'income'
}

const periodLabel: Record<Period, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
}

const MONTHLY_INCOME_STORE_KEY = 'insights:monthlyIncome'
const MONTHLY_INCOME_CURRENCY_STORE_KEY = 'insights:monthlyIncomeCurrency'

const Insights = () => {
  const authedFetch = useAuthedFetch()
  const { isLoaded, isSignedIn } = useAuth()

  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(() => dayjs())
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(null)
  const [monthlyIncomeCurrency, setMonthlyIncomeCurrency] = useState<string | null>(null)
  const [editingIncome, setEditingIncome] = useState(false)
  const [incomeDraft, setIncomeDraft] = useState('')
  const [spendTotals, setSpendTotals] = useState<{
    currency: string
    totalSpendsCents: number
    subscriptionsCents: number
    foodCents: number
    othersCents: number
  } | null>(null)
  const queryKey = useMemo(() => {
    if (period === 'week') return `/summary/week?date=${anchor.format('YYYY-MM-DD')}`
    if (period === 'month') return `/summary/month?month=${anchor.format('YYYY-MM')}`
    return `/summary/year?year=${anchor.format('YYYY')}`
  }, [anchor, period])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 1) Local fallback (fast/offline-friendly)
      try {
        const [rawIncome, rawCurrency] = await Promise.all([
          SecureStore.getItemAsync(MONTHLY_INCOME_STORE_KEY),
          SecureStore.getItemAsync(MONTHLY_INCOME_CURRENCY_STORE_KEY),
        ])
        if (!cancelled) {
          if (rawIncome) {
            const n = Number(rawIncome)
            if (Number.isFinite(n) && n >= 0) {
              setMonthlyIncome(n)
              setIncomeDraft(String(n))
            }
          }
          if (rawCurrency) setMonthlyIncomeCurrency(rawCurrency)
        }
      } catch {
        // ignore
      }

      // 2) Backend DB (source of truth)
      try {
        const res = await authedFetch('/settings/monthly-income')
        if (!res.ok) return
        const json = (await res.json()) as { monthlyIncomeCents: number | null; currency: string | null }
        if (cancelled) return

        const income = typeof json.monthlyIncomeCents === 'number' ? json.monthlyIncomeCents / 100 : null
        setMonthlyIncome(income)
        setMonthlyIncomeCurrency(json.currency ?? null)
        setIncomeDraft(income == null ? '' : String(income))

        try {
          if (income != null) await SecureStore.setItemAsync(MONTHLY_INCOME_STORE_KEY, String(income))
          if (json.currency) await SecureStore.setItemAsync(MONTHLY_INCOME_CURRENCY_STORE_KEY, json.currency)
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authedFetch])

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

      // For the chart design we want a "spending breakdown" built from spends + categories (month view).
      if (period === 'month') {
        const start = anchor.startOf('month').format('YYYY-MM-DD')
        const end = anchor.endOf('month').format('YYYY-MM-DD')
        const [spendsRes, catsRes] = await Promise.all([
          authedFetch(`/spends?from=${start}&to=${end}`),
          authedFetch('/categories'),
        ])
        if (spendsRes.ok && catsRes.ok) {
          const spendsJson = (await spendsRes.json()) as { items: ApiSpend[] }
          const catsJson = (await catsRes.json()) as { items: ApiCategory[] }
          const catsById = new Map((catsJson.items || []).map((c) => [c._id, c]))

          const expenses = (spendsJson.items || []).filter((s) => s.type === 'expense')
          const currency = (expenses[0]?.currency || json.totals[0]?.currency || 'SEK').toUpperCase()

          let total = 0
          let subs = 0
          let food = 0
          let others = 0
          for (const s of expenses) {
            total += s.amountCents || 0
            const cat = s.categoryId ? catsById.get(s.categoryId) : undefined
            if (cat?.kind === 'subscription') subs += s.amountCents || 0
            else if ((cat?.name || '').toLowerCase().includes('food')) food += s.amountCents || 0
            else others += s.amountCents || 0
          }
          setSpendTotals({ currency, totalSpendsCents: total, subscriptionsCents: subs, foodCents: food, othersCents: others })
        } else {
          setSpendTotals(null)
        }
      } else {
        setSpendTotals(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
      setData(null)
      setSpendTotals(null)
    } finally {
      setLoading(false)
    }
  }, [anchor, authedFetch, period, queryKey])

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

  const setPeriodAndResetAnchor = (p: Period) => {
    setPeriod(p)
    setAnchor(dayjs())
  }

  const grandTotalByCurrency = useMemo(() => data?.totals ?? [], [data])
  const firstCurrency = grandTotalByCurrency[0]?.currency ?? 'SEK'
  const incomeCurrency = (monthlyIncomeCurrency ?? firstCurrency).toUpperCase()
  const monthSpends = useMemo(() => {
    if (period !== 'month') return null
    if (!spendTotals) return null
    return spendTotals.totalSpendsCents / 100
  }, [period, spendTotals])
  const remainingAfterSpend = useMemo(() => {
    if (period !== 'month') return null
    if (monthlyIncome == null) return null
    if (monthSpends == null) return null
    return monthlyIncome - monthSpends
  }, [monthSpends, monthlyIncome, period])

  const startEditingIncome = () => {
    setIncomeDraft(monthlyIncome == null ? '' : String(monthlyIncome))
    setEditingIncome(true)
  }

  const saveIncome = async () => {
    const normalized = incomeDraft.replace(',', '.').trim()
    const n = Number(normalized)
    if (!Number.isFinite(n) || n < 0) return
    setMonthlyIncome(n)
    setEditingIncome(false)
    try {
      await SecureStore.setItemAsync(MONTHLY_INCOME_STORE_KEY, String(n))
    } catch {
      // ignore
    }

    try {
      await authedFetch('/settings/monthly-income', {
        method: 'PUT',
        body: JSON.stringify({
          monthlyIncomeCents: Math.round(n * 100),
          currency: incomeCurrency,
        }),
      })
      setMonthlyIncomeCurrency(incomeCurrency)
      try {
        await SecureStore.setItemAsync(MONTHLY_INCOME_CURRENCY_STORE_KEY, incomeCurrency)
      } catch {
        // ignore
      }
    } catch {
      // ignore; local value is still set
    }
  }

  return (
    <SafeScreen className="flex-1 bg-[#EEEAE2] px-5 pt-6">
      <Text className="text-3xl font-sans-extrabold text-black mb-1">Insights</Text>
      <Text className="text-sm font-sans-semibold text-gray-600 mb-5">
        Your financial overview for {headerLabel || dayjs().format('MMMM YYYY')}
      </Text>

      <View className="flex-row rounded-2xl bg-[#E6E0D7] p-1 mb-4">
        {(['week', 'month', 'year'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriodAndResetAnchor(p)}
            className={
              period === p
                ? 'flex-1 rounded-xl bg-[#EDE8E0] py-2.5'
                : 'flex-1 rounded-xl py-2.5'
            }
          >
            <Text
              className={
                period === p
                  ? 'text-center text-sm font-sans-extrabold text-[#2F9C8A]'
                  : 'text-center text-sm font-sans-extrabold text-gray-800'
              }
            >
              {periodLabel[p]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator />
          <Text className="mt-3 text-sm text-gray-500">Loading…</Text>
        </View>
      ) : error ? (
        <Text className="text-center text-sm text-gray-600">{error}</Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {period === 'month' && remainingAfterSpend != null ? (
            <View className="rounded-3xl bg-[#0F2D2A] px-5 py-6" style={{ shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }}>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-sans-semibold text-white/80">Remaining after spends</Text>
                <View className="h-11 w-11 items-center justify-center rounded-full bg-[#2F9C8A]">
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
              </View>
              <Text className="mt-3 text-4xl font-sans-extrabold text-white">
                {formatCurrency(remainingAfterSpend, incomeCurrency)}
              </Text>
            </View>
          ) : (
            <View className="rounded-3xl bg-[#0F2D2A] px-5 py-6">
              <Text className="text-sm font-sans-semibold text-white/80">Remaining after spends</Text>
              <Text className="mt-3 text-4xl font-sans-extrabold text-white">—</Text>
              <Text className="mt-2 text-xs font-sans-semibold text-white/70">Switch to Month to enable this view.</Text>
            </View>
          )}

          <View className="mt-4 rounded-3xl bg-[#E6E0D7] px-5 py-5">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-sans-semibold text-black/70">Monthly Income</Text>
                {editingIncome ? (
                  <TextInput
                    value={incomeDraft}
                    onChangeText={setIncomeDraft}
                    placeholder="Enter your monthly income"
                    keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                    className="mt-2 rounded-xl bg-white px-4 py-3 text-base font-sans-extrabold text-black"
                    autoFocus
                    onSubmitEditing={saveIncome}
                    returnKeyType="done"
                  />
                ) : (
                  <Text className="mt-2 text-3xl font-sans-extrabold text-black">
                    {monthlyIncome == null ? '—' : formatCurrency(monthlyIncome, incomeCurrency)}
                  </Text>
                )}
              </View>
              <Pressable onPress={editingIncome ? saveIncome : startEditingIncome} hitSlop={10} className="h-12 w-12 items-center justify-center rounded-2xl bg-[#EEEAE2]">
                <Ionicons name={editingIncome ? 'checkmark' : 'pencil'} size={18} color="#111827" />
              </Pressable>
            </View>
          </View>

          <View className="mt-4 rounded-3xl bg-[#E6E0D7] px-5 py-5">
            <Text className="text-lg font-sans-extrabold text-black">Spending Breakdown</Text>

            <View className="mt-5 flex-row items-center gap-5">
              <DonutChart
                size={170}
                thickness={26}
                slices={[
                  { value: spendTotals?.subscriptionsCents ?? 0, color: "#84AE93" },
                  { value: spendTotals?.foodCents ?? 0, color: "#A7C7B5" },
                  { value: spendTotals?.othersCents ?? 0, color: "#0F2D2A" },
                ]}
                trackColor="#D7D0C7"
              />

              <View className="flex-1 gap-4">
                {(() => {
                  const total = spendTotals?.totalSpendsCents ?? 0
                  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0)
                  const subsPct = pct(spendTotals?.subscriptionsCents ?? 0)
                  const foodPct = pct(spendTotals?.foodCents ?? 0)
                  const otherPct = Math.max(0, 100 - subsPct - foodPct)
                  return (
                    <>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: "#84AE93" }} />
                          <Text className="text-sm font-sans-semibold text-black/80">Subscriptions</Text>
                        </View>
                        <Text className="text-lg font-sans-extrabold text-black">{subsPct}%</Text>
                      </View>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: "#A7C7B5" }} />
                          <Text className="text-sm font-sans-semibold text-black/80">Food</Text>
                        </View>
                        <Text className="text-lg font-sans-extrabold text-black">{foodPct}%</Text>
                      </View>
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <View className="h-3 w-3 rounded-full" style={{ backgroundColor: "#0F2D2A" }} />
                          <Text className="text-sm font-sans-semibold text-black/80">Others</Text>
                        </View>
                        <Text className="text-lg font-sans-extrabold text-black">{otherPct}%</Text>
                      </View>
                    </>
                  )
                })()}
              </View>
            </View>

            <View className="mt-6 h-px bg-[#D7D0C7]" />
            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-base font-sans-extrabold text-black/60">Total Spends</Text>
              <Text className="text-base font-sans-extrabold text-black">
                {formatCurrency((spendTotals?.totalSpendsCents ?? 0) / 100, incomeCurrency)}
              </Text>
            </View>
          </View>

          <View className="h-10" />
        </ScrollView>
      )}
    </SafeScreen>
  )
}

export default Insights
