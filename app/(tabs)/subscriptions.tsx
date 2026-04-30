import NewSpendModal from '@/components/NewSpendModal'
import { SafeScreen } from '@/components/SafeScreen'
import SubscriptionCard from '@/components/SubscriptionCard'
import { icons } from '@/constants/icons'
import { invalidateApiCache, useAuthedFetch } from '@/hooks/useAuthedFetch'
import { useAuth } from '@clerk/expo'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
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
      setItems(spendsJson.items || [])

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

  const iconForServiceKey = useCallback(
    (serviceKey?: string | null) => {
      const key = (serviceKey || '').toLowerCase()
      if (key === 'spotify') return icons.spotify
      if (key === 'github') return icons.github
      if (key === 'notion') return icons.notion
      if (key === 'dropbox') return icons.dropbox
      if (key === 'openai') return icons.openai
      if (key === 'adobe') return icons.adobe
      if (key === 'medium') return icons.medium
      if (key === 'figma') return icons.figma
      if (key === 'claude') return icons.claude
      if (key === 'canva') return icons.canva
      return icons.wallet
    },
    [],
  )

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
    <SafeScreen className="flex-1 bg-background p-5">
      <View className="flex-row items-center justify-between mt-2 mb-5">
        <Text className="text-xl text-black">All spends</Text>
        <Pressable
          onPress={openSpendModal}
          hitSlop={10}
          className="h-11 w-11 items-center justify-center rounded-full bg-primary"
        >
          <Text className="text-white text-2xl leading-none">+</Text>
        </Pressable>
      </View>
      <FlatList 
        showsVerticalScrollIndicator={false} 
        data={items} 
        renderItem={({item}) => ( 
          <SubscriptionCard
            expanded={expandedSpendId === item._id}
            onPress={() => setExpandedSpendId((cur) => (cur === item._id ? null : item._id))}
            onDeletePress={() => {
              if (!deletingId) deleteOne(item)
            }}
            isDeleting={deletingId === item._id}
            icon={iconForServiceKey(item.serviceKey)}
            name={item.title}
            price={item.amountCents / 100}
            currency={item.currency}
            billing="One-time"
            renewalDate={item.renewalAt ?? undefined}
            startDate={item.occurredAt}
            status={item.type}
            paymentMethod=""
            category={item.categoryId ? categoryNameById.get(item.categoryId) || '' : ''}
            plan={item.notes ?? undefined}
            color={undefined}
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