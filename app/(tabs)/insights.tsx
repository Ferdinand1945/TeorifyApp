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

  const grandTotalByCurrency = useMemo(() => data?.totals ?? [], [data])
  const firstCurrency = grandTotalByCurrency[0]?.currency ?? 'SEK'
  const incomeCurrency = (monthlyIncomeCurrency ?? firstCurrency).toUpperCase()
  const monthTotal = useMemo(() => {
    if (period !== 'month') return null
    if (grandTotalByCurrency.length === 0) return null
    // If multiple currencies exist, we show the first for now.
    return grandTotalByCurrency[0].totalCents / 100
  }, [grandTotalByCurrency, period])
  const remainingAfterSpend = useMemo(() => {
    if (period !== 'month') return null
    if (monthlyIncome == null) return null
    if (monthTotal == null) return null
    return monthlyIncome - monthTotal
  }, [monthTotal, monthlyIncome, period])

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
    <SafeScreen className="flex-1 bg-background p-5">
      <Text className="text-xl font-semibold text-black mb-1">Insights</Text>
      <Text className="text-sm text-gray-600 mb-5">
        Spending and recurring subscriptions for the period you select.
      </Text>
      <View className="flex-row justify-between mb-4 rounded-2xl bg-white px-2 py-2">
        <View className="flex-1 gap-1 pr-3">
          <Text className="text-sm text-black">Add your monthly income</Text>

          {editingIncome ? (
            <TextInput
              value={incomeDraft}
              onChangeText={setIncomeDraft}
              placeholder="Enter your monthly income"
              keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
              className="text-sm text-black border border-gray-300 rounded-md px-3 py-2"
              autoFocus
              onSubmitEditing={saveIncome}
              returnKeyType="done"
            />
          ) : (
            <View className="gap-0.5">
              <Text className="text-2xl font-semibold text-black">
                {monthlyIncome == null ? '—' : formatCurrency(monthlyIncome, incomeCurrency)}
              </Text>
              {period === 'month' && remainingAfterSpend != null && (
                <Text className="text-lg text-gray-800">
                  Remaining after spends: {formatCurrency(remainingAfterSpend, incomeCurrency)}
                </Text>
              )}
              {period !== 'month' && (
                <Text className="text-xs text-gray-600">Switch to Month to see remaining after spends.</Text>
              )}
            </View>
          )}
        </View>

        <Pressable
          onPress={editingIncome ? saveIncome : startEditingIncome}
          className="justify-end"
          hitSlop={10}
        >
          <Ionicons name={editingIncome ? 'checkmark-circle' : 'add-circle'} size={40} color="black" />
        </Pressable>
      </View>
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
