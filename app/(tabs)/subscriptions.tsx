import { SafeScreen } from '@/components/SafeScreen'
import SubscriptionCard from '@/components/SubscriptionCard'
import { icons } from '@/constants/icons'
import { useAuthedFetch } from '@/hooks/useAuthedFetch'
import { useAuth } from '@clerk/expo'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native'

type ApiSubscription = {
  _id: string
  userId: string
  name: string
  amountCents: number
  currency: string
  billingCycle: 'weekly' | 'monthly' | 'yearly'
  nextBillingDate: string
  categoryId?: string | null
  isActive: boolean
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
  const [expandedSubscription, setExpandedSubscription] = useState<string | null>(null)
  const authedFetch = useAuthedFetch()
  const { isLoaded, isSignedIn } = useAuth()

  const [items, setItems] = useState<ApiSubscription[]>([])
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<ApiSubscription | null>(null)
  const [form, setForm] = useState({
    name: '',
    amount: '',
    currency: 'USD',
    billingCycle: 'monthly' as ApiSubscription['billingCycle'],
    nextBillingDate: '',
    categoryId: null as string | null,
    notes: '',
  })

  const load = useCallback(async () => {
    setError(null)
    try {
      const [subsRes, catsRes] = await Promise.all([authedFetch('/subscriptions'), authedFetch('/categories')])

      if (!subsRes.ok) {
        const txt = await subsRes.text()
        throw new Error(txt || `Request failed (${subsRes.status})`)
      }
      const subsJson = (await subsRes.json()) as { items: ApiSubscription[] }
      setItems(subsJson.items || [])

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
      setExpandedSubscription(null)
      setLoading(false)
      setError('Please sign in to view subscriptions.')
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

  const iconForName = useCallback((name: string) => {
    const n = name.toLowerCase()
    if (n.includes('spotify')) return icons.spotify
    if (n.includes('notion')) return icons.notion
    if (n.includes('figma')) return icons.figma
    if (n.includes('github')) return icons.github
    if (n.includes('adobe')) return icons.adobe
    if (n.includes('claude')) return icons.claude
    if (n.includes('canva')) return icons.canva
    if (n.includes('openai')) return icons.openai
    if (n.includes('dropbox')) return icons.dropbox
    if (n.includes('medium')) return icons.medium
    return icons.wallet
  }, [])

  const uiItems: Subscription[] = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c._id, c.name]))
    return items.map((s) => ({
      id: s._id,
      icon: iconForName(s.name),
      name: s.name,
      plan: s.notes || undefined,
      category: s.categoryId ? catMap.get(s.categoryId) || '' : '',
      paymentMethod: '',
      status: s.isActive ? 'active' : 'paused',
      startDate: s.createdAt,
      price: s.amountCents / 100,
      currency: s.currency,
      billing: s.billingCycle === 'yearly' ? 'Yearly' : s.billingCycle === 'weekly' ? 'Weekly' : 'Monthly',
      renewalDate: s.nextBillingDate,
      color: undefined,
    }))
  }, [categories, iconForName, items])

  const openCreate = useCallback(() => {
    setEditing(null)
    setForm({
      name: '',
      amount: '',
      currency: 'USD',
      billingCycle: 'monthly',
      nextBillingDate: new Date().toISOString().slice(0, 10),
      categoryId: null,
      notes: '',
    })
    setIsModalOpen(true)
  }, [])

  const openEdit = useCallback((sub: ApiSubscription) => {
    setEditing(sub)
    setForm({
      name: sub.name,
      amount: String(sub.amountCents / 100),
      currency: sub.currency,
      billingCycle: sub.billingCycle,
      nextBillingDate: new Date(sub.nextBillingDate).toISOString().slice(0, 10),
      categoryId: sub.categoryId ?? null,
      notes: sub.notes || '',
    })
    setIsModalOpen(true)
  }, [])

  const submit = useCallback(async () => {
    const amountNumber = Number(form.amount)
    if (!form.name.trim()) return Alert.alert('Missing name', 'Please enter a subscription name.')
    if (!Number.isFinite(amountNumber) || amountNumber < 0) {
      return Alert.alert('Invalid amount', 'Please enter a valid amount.')
    }
    if (!form.currency.trim() || form.currency.trim().length !== 3) {
      return Alert.alert('Invalid currency', 'Use a 3-letter currency code like USD, SEK, EUR.')
    }
    if (!form.nextBillingDate.trim()) {
      return Alert.alert('Invalid date', 'Use YYYY-MM-DD.')
    }

    const payload = {
      name: form.name.trim(),
      amountCents: Math.round(amountNumber * 100),
      currency: form.currency.trim().toUpperCase(),
      billingCycle: form.billingCycle,
      nextBillingDate: form.nextBillingDate.trim(),
      categoryId: form.categoryId,
      notes: form.notes.trim() ? form.notes.trim() : null,
      ...(editing ? { isActive: editing.isActive } : { isActive: true }),
    }

    try {
      const res = await authedFetch(editing ? `/subscriptions/${editing._id}` : '/subscriptions', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Request failed (${res.status})`)
      }
      setIsModalOpen(false)
      await load()
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'Unknown error')
    }
  }, [authedFetch, editing, form, load])

  const deleteOne = useCallback(
    async (sub: ApiSubscription) => {
      Alert.alert('Delete subscription?', sub.name, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await authedFetch(`/subscriptions/${sub._id}`, { method: 'DELETE' })
              if (!res.ok && res.status !== 204) {
                const txt = await res.text()
                throw new Error(txt || `Request failed (${res.status})`)
              }
              await load()
            } catch (e) {
              Alert.alert('Delete failed', e instanceof Error ? e.message : 'Unknown error')
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
        <Text className="text-xl text-black">All subscriptions</Text>
        <Pressable
          onPress={openCreate}
          hitSlop={10}
          className="h-11 w-11 items-center justify-center rounded-full bg-primary"
        >
          <Text className="text-white text-2xl leading-none">+</Text>
        </Pressable>
      </View>
      <FlatList 
        showsVerticalScrollIndicator={false} 
        data={uiItems} 
        renderItem={({item}) => ( 
          <SubscriptionCard 
            expanded={expandedSubscription === item.id} 
            onPress={() => setExpandedSubscription((currentId) => currentId === item.id ? null : item.id)} 
            onEditPress={() => {
              const sub = items.find((s) => s._id === item.id)
              if (sub) openEdit(sub)
            }}
            onDeletePress={() => {
              const sub = items.find((s) => s._id === item.id)
              if (sub) deleteOne(sub)
            }}
            {...item}
          />
        )}
        keyExtractor={(item) => item.id} 
        ItemSeparatorComponent={() => <View className="h-4" />} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          loading ? (
            <Text className="text-center text-sm text-gray-500">Loading…</Text>
          ) : error ? (
            <Text className="text-center text-sm text-gray-500">{error}</Text>
          ) : (
            <Text className="text-center text-sm text-gray-500">No subscriptions found</Text>
          )
        }
        extraData={expandedSubscription}
        ListFooterComponent={<Text className="text-center text-sm text-gray-500">No more subscriptions</Text>}
      />

      <Modal visible={isModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background p-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-semibold text-black">{editing ? 'Edit subscription' : 'New subscription'}</Text>
            <Pressable onPress={() => setIsModalOpen(false)} hitSlop={10}>
              <Text className="text-primary font-semibold">Close</Text>
            </Pressable>
          </View>

          <View className="gap-3">
            <View>
              <Text className="text-sm text-gray-600 mb-1">Name</Text>
              <TextInput value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} className="rounded-xl bg-white px-4 py-3" />
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-sm text-gray-600 mb-1">Amount</Text>
                <TextInput
                  value={form.amount}
                  onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
                  keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                  className="rounded-xl bg-white px-4 py-3"
                />
              </View>
              <View className="w-28">
                <Text className="text-sm text-gray-600 mb-1">Currency</Text>
                <TextInput
                  value={form.currency}
                  onChangeText={(t) => setForm((f) => ({ ...f, currency: t }))}
                  autoCapitalize="characters"
                  className="rounded-xl bg-white px-4 py-3"
                />
              </View>
            </View>
            <View>
              <Text className="text-sm text-gray-600 mb-1">Billing cycle (weekly/monthly/yearly)</Text>
              <TextInput
                value={form.billingCycle}
                onChangeText={(t) =>
                  setForm((f) => ({
                    ...f,
                    billingCycle: (t === 'weekly' || t === 'yearly' || t === 'monthly' ? t : f.billingCycle) as ApiSubscription['billingCycle'],
                  }))
                }
                autoCapitalize="none"
                className="rounded-xl bg-white px-4 py-3"
              />
            </View>
            <View>
              <Text className="text-sm text-gray-600 mb-1">Category</Text>
              <View className="rounded-xl bg-white px-4 py-2">
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => setForm((f) => ({ ...f, categoryId: null }))}
                    className="rounded-full bg-gray-100 px-3 py-2"
                  >
                    <Text className="text-black">None</Text>
                  </Pressable>
                  {categories
                    .filter((c) => c.kind === 'subscription' || c.kind === 'expense')
                    .map((c) => (
                      <Pressable
                        key={c._id}
                        onPress={() => setForm((f) => ({ ...f, categoryId: c._id }))}
                        className={
                          c._id === form.categoryId
                            ? 'rounded-full bg-primary px-3 py-2'
                            : 'rounded-full bg-gray-100 px-3 py-2'
                        }
                      >
                        <Text className={c._id === form.categoryId ? 'text-white' : 'text-black'}>{c.name}</Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            </View>
            <View>
              <Text className="text-sm text-gray-600 mb-1">Next billing date (YYYY-MM-DD)</Text>
              <TextInput
                value={form.nextBillingDate}
                onChangeText={(t) => setForm((f) => ({ ...f, nextBillingDate: t }))}
                autoCapitalize="none"
                className="rounded-xl bg-white px-4 py-3"
              />
            </View>
            <View>
              <Text className="text-sm text-gray-600 mb-1">Notes</Text>
              <TextInput
                value={form.notes}
                onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))}
                multiline
                className="rounded-xl bg-white px-4 py-3 min-h-[96px]"
              />
            </View>
          </View>

          <View className="mt-6 flex-row gap-3">
            <Pressable onPress={() => setIsModalOpen(false)} className="flex-1 rounded-xl bg-gray-200 px-4 py-3">
              <Text className="text-center font-semibold text-black">Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} className="flex-1 rounded-xl bg-primary px-4 py-3">
              <Text className="text-center font-semibold text-white">Save</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeScreen>
  )
}

export default Subscriptions