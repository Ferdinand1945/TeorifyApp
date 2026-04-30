import NewSpendModal from '@/components/NewSpendModal'
import ExpandableSpendCard from '@/components/ExpandableSpendCard'
import { SafeScreen } from '@/components/SafeScreen'
import { iconSourceForServiceKey, labelForServiceKey } from '@/lib/spendDisplay'
import { cancelReminderForSpendId, syncSubscriptionReminders } from '@/lib/subscriptionReminders'
import { invalidateApiCache, useAuthedFetch } from '@/hooks/useAuthedFetch'
import { useAuth } from '@clerk/expo'
import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native'

type ApiSpend = {
  _id: string
  userId: string
  title: string
  type: 'expense' | 'income'
  amountCents: number
  currency: string
  occurredAt: string
  renewalAt?: string | null
  categoryId?: string | null
  serviceKey?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

type ApiCategory = {
  _id: string
  userId: string
  name: string
  kind: 'subscription' | 'expense' | 'income'
  createdAt: string
  updatedAt: string
}

const Subscriptions = () => {
  const authedFetch = useAuthedFetch()
  const { isLoaded, isSignedIn } = useAuth()

  const [items, setItems] = useState<ApiSpend[]>([])
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedSpendId, setExpandedSpendId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [spendModalOpen, setSpendModalOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [spendsRes, catsRes] = await Promise.all([authedFetch('/spends'), authedFetch('/categories')])

      if (!spendsRes.ok) {
        const txt = await spendsRes.text()
        throw new Error(txt || `Request failed (${spendsRes.status})`)
      }
      const spendsJson = (await spendsRes.json()) as { items: ApiSpend[] }
      const nextItems = spendsJson.items || []
      setItems(nextItems)
      await syncSubscriptionReminders(nextItems)

      if (catsRes.ok) {
        const catsJson = (await catsRes.json()) as { items: ApiCategory[] }
        setCategories(catsJson.items || [])

        if ((catsJson.items || []).length === 0) {
          const seeded = await authedFetch('/categories/seed', { method: 'POST' })
          if (seeded.ok) {
            const seededJson = (await seeded.json()) as { items: ApiCategory[] }
            setCategories(seededJson.items || [])
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setItems([])
      setCategories([])
      setLoading(false)
      setError('Please sign in to view spends.')
      return
    }
    load()
  }, [isLoaded, isSignedIn, load])

  const onRefresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [isLoaded, isSignedIn, load])

  const openSpendModal = () => setSpendModalOpen(true)

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c._id, c.name)
    return m
  }, [categories])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((s) => {
      const title = (s.title || '').toLowerCase()
      const cat = s.categoryId ? (categoryNameById.get(s.categoryId) || '').toLowerCase() : ''
      return title.includes(q) || cat.includes(q)
    })
  }, [categoryNameById, items, query])

  const deleteOne = useCallback(
    async (spend: ApiSpend) => {
      Alert.alert('Delete spend?', spend.title, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            let watchdogId: ReturnType<typeof setTimeout> | null = null
            try {
              setDeletingId(spend._id)
              watchdogId = setTimeout(() => {
                setDeletingId((cur) => (cur === spend._id ? null : cur))
              }, 20_000)
              const res = await authedFetch(`/spends/${spend._id}`, { method: 'DELETE' })
              if (!res.ok && res.status !== 204) {
                const txt = await res.text()
                throw new Error(txt || `Request failed (${res.status})`)
              }
              invalidateApiCache(['/spends', '/summary'])
              await cancelReminderForSpendId(spend._id)
              setExpandedSpendId((cur) => (cur === spend._id ? null : cur))
              await load()
              Alert.alert('Deleted', `${spend.title} was deleted.`)
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error'
              Alert.alert('Delete failed', msg.includes('aborted') ? 'Request timed out. Check EXPO_PUBLIC_API_URL.' : msg)
            } finally {
              if (watchdogId) clearTimeout(watchdogId)
              setDeletingId(null)
            }
          },
        },
      ])
    },
    [authedFetch, load],
  )

  return (
    <SafeScreen className="flex-1 bg-[#EEEAE2] px-5 pt-6">
      <View className="flex-row items-center justify-between">
        <Text className="text-3xl font-sans-extrabold text-black">All Spends</Text>
        <Pressable className="h-11 w-11 items-center justify-center rounded-2xl bg-[#E6E0D7]" hitSlop={10}>
          <Ionicons name="notifications-outline" size={20} color="#111827" />
        </Pressable>
      </View>

      <View className="mt-4 flex-row items-center gap-3 rounded-2xl bg-[#E6E0D7] px-4 py-3">
        <Ionicons name="search" size={18} color="#6B7280" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions..."
          placeholderTextColor="#6B7280"
          className="flex-1 text-sm font-sans-semibold text-black"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 140 }}
        data={filtered} 
        renderItem={({ item }) => (
          <ExpandableSpendCard
            spend={{
              title: item.title,
              type: item.type,
              amountCents: item.amountCents,
              currency: item.currency,
              occurredAt: item.occurredAt,
              renewalAt: item.renewalAt,
              categoryLabel: item.categoryId ? categoryNameById.get(item.categoryId) || 'Uncategorized' : 'Uncategorized',
              serviceKeyLabel: labelForServiceKey(item.serviceKey),
              notes: item.notes,
            }}
            icon={iconSourceForServiceKey(item.serviceKey)}
            expanded={expandedSpendId === item._id}
            onToggle={() => setExpandedSpendId((id) => (id === item._id ? null : item._id))}
            onDeletePress={() => deleteOne(item)}
            isDeleting={deletingId === item._id}
          />
        )}
        keyExtractor={(item) => item._id} 
        ItemSeparatorComponent={() => <View className="h-4" />} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? (
            <Text className="text-center text-sm text-gray-500">Loading…</Text>
          ) : error ? (
            <Text className="text-center text-sm text-gray-500">{error}</Text>
          ) : (
            <Text className="text-center text-sm text-gray-500">No spends found</Text>
          )
        }
        ListFooterComponent={<Text className="text-center text-sm text-gray-500">No more spends</Text>}
      />

      <Pressable
        onPress={openSpendModal}
        className="absolute bottom-28 right-6 h-16 w-16 items-center justify-center rounded-full bg-[#2F9C8A]"
        style={{ shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}
      >
        <Text className="text-white text-3xl leading-none">+</Text>
      </Pressable>

      <NewSpendModal
        visible={spendModalOpen}
        onRequestClose={() => setSpendModalOpen(false)}
        authedFetch={authedFetch}
        categories={categories}
        onSaved={load}
        initialOccurredAt={null}
      />
    </SafeScreen>
  )
}

export default Subscriptions