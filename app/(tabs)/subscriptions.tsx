import { SafeScreen } from '@/components/SafeScreen'
import { invalidateApiCache, useAuthedFetch } from '@/hooks/useAuthedFetch'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@clerk/expo'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import dayjs from 'dayjs'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'

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
  const cameraRef = useRef<CameraView | null>(null)

  const [items, setItems] = useState<ApiSpend[]>([])
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [spendModalOpen, setSpendModalOpen] = useState(false)
  const [savingSpend, setSavingSpend] = useState(false)
  const [datePicker, setDatePicker] = useState<null | { field: 'occurredAt' | 'renewalAt'; value: Date }>(null)
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [scanningReceipt, setScanningReceipt] = useState(false)
  const [pendingCameraOpen, setPendingCameraOpen] = useState(false)
  const [cameraInlineOpen, setCameraInlineOpen] = useState(false)

  const [spendForm, setSpendForm] = useState({
    title: '',
    amount: '',
    currency: 'USD',
    occurredAt: null as Date | null,
    renewalAt: null as Date | null,
    categoryId: null as string | null,
    notes: '',
  })

  const closeCamera = () => {
    setCameraModalOpen(false)
    setScanningReceipt(false)
    setPendingCameraOpen(false)
    setCameraInlineOpen(false)
  }

  const closeSpend = () => {
    setSpendModalOpen(false)
    setDatePicker(null)
    closeCamera()
  }

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

  const openSpendModal = () => {
    setSpendForm({
      title: '',
      amount: '',
      currency: 'USD',
      occurredAt: null,
      renewalAt: null,
      categoryId: null,
      notes: '',
    })
    setSpendModalOpen(true)
  }

  const submitSpend = async () => {
    if (savingSpend) return
    const amountNumber = Number(spendForm.amount)
    if (!spendForm.title.trim()) return
    if (!Number.isFinite(amountNumber) || amountNumber < 0) return

    setSavingSpend(true)
    try {
      const payload: Record<string, unknown> = {
        title: spendForm.title.trim(),
        type: 'expense',
        amountCents: Math.round(amountNumber * 100),
        currency: spendForm.currency.trim().toUpperCase(),
        categoryId: spendForm.categoryId,
        notes: spendForm.notes.trim() ? spendForm.notes.trim() : null,
        occurredAt: spendForm.occurredAt ? dayjs(spendForm.occurredAt).format('YYYY-MM-DD') : undefined,
        renewalAt: spendForm.renewalAt ? dayjs(spendForm.renewalAt).format('YYYY-MM-DD') : undefined,
      }

      const res = await authedFetch('/spends', { method: 'POST', body: JSON.stringify(payload) })
      if (res.ok) {
        setSpendModalOpen(false)
        invalidateApiCache(['/spends', '/summary'])
        await load()
      }
    } finally {
      setSavingSpend(false)
    }
  }

  const openCamera = async () => {
    if (scanningReceipt) return
    const granted = cameraPermission?.granted
    if (!granted) {
      const res = await requestCameraPermission()
      if (!res.granted) {
        Alert.alert('Camera permission needed', 'Enable camera permission to scan a receipt.')
        return
      }
    }
    setCameraInlineOpen(true)
  }

  useEffect(() => {
    if (!pendingCameraOpen) return
    if (!cameraPermission?.granted) return
    const t = setTimeout(() => {
      setCameraModalOpen(true)
      setPendingCameraOpen(false)
    }, 0)
    return () => clearTimeout(t)
  }, [cameraPermission?.granted, pendingCameraOpen])

  const scanReceiptFromUri = async (uri: string) => {
    if (scanningReceipt) return
    setScanningReceipt(true)
    try {
      const img = await manipulateAsync(uri, [{ resize: { width: 1280 } }], {
        compress: 0.65,
        format: SaveFormat.JPEG,
        base64: true,
      })
      if (!img.base64) throw new Error('Failed to encode image')

      const res = await authedFetch('/spends/scan-receipt', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: img.base64, mimeType: 'image/jpeg' }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Request failed (${res.status})`)
      }
      const json = (await res.json()) as {
        result: { title?: string | null; amount?: number | null; currency?: string | null; occurredAt?: string | null }
      }
      const r = json.result

      setSpendForm((f) => ({
        ...f,
        title: r.title ?? f.title,
        amount: typeof r.amount === 'number' ? String(r.amount) : f.amount,
        currency: r.currency ? r.currency : f.currency,
        occurredAt: r.occurredAt
          ? (() => {
              const [year, month, day] = r.occurredAt.split('-').map(Number)
              return new Date(year, month - 1, day)
            })()
          : f.occurredAt,
      }))
      closeCamera()

      if (!r.amount && !r.title && !r.occurredAt) {
        Alert.alert("Couldn't read receipt", 'Try taking the photo closer with good lighting.')
      }
    } catch (e) {
      Alert.alert('Receipt scan failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setScanningReceipt(false)
    }
  }

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
          <View className="rounded-2xl border border-border bg-card px-4 py-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-base font-sans-bold text-primary" numberOfLines={1}>{item.title}</Text>
                <Text className="text-sm font-sans-medium text-muted-foreground" numberOfLines={1}>
                  {dayjs(item.occurredAt).format('MMM D, YYYY')}
                  {item.renewalAt ? ` • renew ${dayjs(item.renewalAt).format('MMM D, YYYY')}` : ''}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-base font-sans-bold text-primary">
                  {(item.amountCents / 100).toFixed(2)} {item.currency}
                </Text>
                <Pressable
                  onPress={() => {
                    if (!deletingId) deleteOne(item)
                  }}
                  disabled={deletingId === item._id}
                  hitSlop={10}
                  className={deletingId === item._id ? 'mt-1 rounded-full bg-destructive/60 px-3 py-1' : 'mt-1 rounded-full bg-destructive px-3 py-1'}
                >
                  <View className="flex-row items-center justify-center gap-2">
                    {deletingId === item._id && <ActivityIndicator color="#fff" size="small" />}
                    <Text className="text-xs font-sans-semibold text-white">{deletingId === item._id ? 'Deleting…' : 'Delete'}</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>
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

      <Modal
        visible={spendModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSpend}
      >
        <Pressable className="flex-1" onPress={() => Keyboard.dismiss()}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-[#F6F7FF] p-5">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-3">
              <Text className="text-xl font-semibold text-black">New spend</Text>
              <Pressable onPress={openCamera} hitSlop={10} disabled={savingSpend || scanningReceipt}>
                <View className={savingSpend || scanningReceipt ? 'opacity-50' : ''}>
                  <Ionicons name="camera" size={22} color="#111827" />
                </View>
              </Pressable>
            </View>
            <Pressable onPress={() => (savingSpend ? null : closeSpend())} hitSlop={10} disabled={savingSpend}>
              <Text className="text-primary font-semibold">Close</Text>
            </Pressable>
          </View>

          <View className="gap-3">
            <View>
              <Text className="text-sm text-gray-600 mb-1">Title</Text>
              <TextInput
                value={spendForm.title}
                onChangeText={(t) => setSpendForm((f) => ({ ...f, title: t }))}
                className="rounded-xl bg-white px-4 py-3"
              />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-sm text-gray-600 mb-1">Amount</Text>
                <TextInput
                  value={spendForm.amount}
                  onChangeText={(t) => setSpendForm((f) => ({ ...f, amount: t }))}
                  keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                  className="rounded-xl bg-white px-4 py-3"
                />
              </View>
              <View className="w-28">
                <Text className="text-sm text-gray-600 mb-1">Currency</Text>
                <TextInput
                  value={spendForm.currency}
                  onChangeText={(t) => setSpendForm((f) => ({ ...f, currency: t }))}
                  autoCapitalize="characters"
                  className="rounded-xl bg-white px-4 py-3"
                />
              </View>
            </View>

            <View>
              <Text className="text-sm text-gray-600 mb-1">Date (optional)</Text>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() =>
                    setDatePicker({
                      field: 'occurredAt',
                      value: spendForm.occurredAt ?? new Date(),
                    })
                  }
                  className="flex-1 rounded-xl bg-white px-4 py-3"
                >
                  <Text className="text-black">
                    {spendForm.occurredAt ? dayjs(spendForm.occurredAt).format('YYYY-MM-DD') : 'Not set'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSpendForm((f) => ({ ...f, occurredAt: null }))}
                  className="rounded-xl bg-gray-200 px-4 py-3"
                >
                  <Text className="text-black font-semibold">Clear</Text>
                </Pressable>
              </View>
            </View>

            <View>
              <Text className="text-sm text-gray-600 mb-1">Renewal date (optional)</Text>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={() =>
                    setDatePicker({
                      field: 'renewalAt',
                      value: spendForm.renewalAt ?? new Date(),
                    })
                  }
                  className="flex-1 rounded-xl bg-white px-4 py-3"
                >
                  <Text className="text-black">
                    {spendForm.renewalAt ? dayjs(spendForm.renewalAt).format('YYYY-MM-DD') : 'Not set'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSpendForm((f) => ({ ...f, renewalAt: null }))}
                  className="rounded-xl bg-gray-200 px-4 py-3"
                >
                  <Text className="text-black font-semibold">Clear</Text>
                </Pressable>
              </View>
            </View>

            <View>
              <Text className="text-sm text-gray-600 mb-1">Category</Text>
              <View className="rounded-xl bg-white px-4 py-2">
                <View className="flex-row flex-wrap gap-2">
                  <Pressable onPress={() => setSpendForm((f) => ({ ...f, categoryId: null }))} className="rounded-full bg-gray-100 px-3 py-2">
                    <Text className="text-black">None</Text>
                  </Pressable>
                  {categories
                    .filter((c) => c.kind === 'expense' || c.kind === 'subscription')
                    .map((c) => (
                      <Pressable
                        key={c._id}
                        onPress={() => setSpendForm((f) => ({ ...f, categoryId: c._id }))}
                        className={c._id === spendForm.categoryId ? 'rounded-full bg-primary px-3 py-2' : 'rounded-full bg-gray-100 px-3 py-2'}
                      >
                        <Text className={c._id === spendForm.categoryId ? 'text-white' : 'text-black'}>{c.name}</Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            </View>

            <View>
              <Text className="text-sm text-gray-600 mb-1">Notes</Text>
              <TextInput
                value={spendForm.notes}
                onChangeText={(t) => setSpendForm((f) => ({ ...f, notes: t }))}
                multiline
                className="rounded-xl bg-white px-4 py-3 min-h-[96px]"
              />
            </View>
          </View>

          <View className="mt-6 flex-row gap-3">
            <Pressable onPress={closeSpend} className="flex-1 rounded-xl bg-gray-200 px-4 py-3" disabled={savingSpend}>
              <Text className="text-center font-semibold text-black">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submitSpend}
              className={savingSpend ? 'flex-1 rounded-xl bg-primary/70 px-4 py-3' : 'flex-1 rounded-xl bg-primary px-4 py-3'}
              disabled={savingSpend}
            >
              <View className="flex-row items-center justify-center gap-2">
                {savingSpend && <ActivityIndicator color="#fff" />}
                <Text className="text-center font-semibold text-white">{savingSpend ? 'Saving...' : 'Save'}</Text>
              </View>
            </Pressable>
          </View>

          {datePicker && (
            <DateTimePicker
              value={datePicker.value}
              mode="date"
              display="default"
              onValueChange={(_event, selected) => {
                if (!selected) return
                setSpendForm((f) =>
                  datePicker.field === 'occurredAt' ? { ...f, occurredAt: selected } : { ...f, renewalAt: selected },
                )
                if (Platform.OS !== 'ios') setDatePicker(null)
              }}
              onDismiss={() => setDatePicker(null)}
            />
          )}

          {cameraInlineOpen && (
            <View className="absolute inset-0 bg-black">
              {cameraPermission?.granted ? (
                <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
              ) : (
                <View className="flex-1 items-center justify-center px-6">
                  <Text className="text-white text-base text-center">Camera permission is required.</Text>
                  <Pressable
                    onPress={async () => {
                      const res = await requestCameraPermission()
                      if (res.granted) setCameraInlineOpen(true)
                    }}
                    className="mt-4 rounded-xl bg-white px-4 py-3"
                  >
                    <Text className="text-black font-semibold">Grant permission</Text>
                  </Pressable>
                </View>
              )}

              <View className="absolute bottom-0 left-0 right-0 p-5">
                <View className="flex-row items-center justify-between">
                  <Pressable
                    onPress={() => setCameraInlineOpen(false)}
                    disabled={scanningReceipt}
                    className={scanningReceipt ? 'rounded-xl bg-white/20 px-4 py-3' : 'rounded-xl bg-white/30 px-4 py-3'}
                  >
                    <Text className="text-white font-semibold">Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={async () => {
                      if (scanningReceipt) return
                      if (!cameraPermission?.granted) return
                      const pic = await cameraRef.current?.takePictureAsync?.({ quality: 0.75, skipProcessing: true })
                      if (!pic?.uri) return
                      await scanReceiptFromUri(pic.uri)
                      setCameraInlineOpen(false)
                    }}
                    disabled={scanningReceipt}
                    className={scanningReceipt ? 'rounded-full bg-white/40 px-6 py-4' : 'rounded-full bg-white px-6 py-4'}
                  >
                    <View className="flex-row items-center justify-center gap-2">
                      {scanningReceipt && <ActivityIndicator color="#111827" />}
                      <Text className="text-black font-semibold">{scanningReceipt ? 'Scanning…' : 'Capture'}</Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={cameraModalOpen}
        animationType="fade"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : 'fullScreen'}
        statusBarTranslucent
        onRequestClose={() => (scanningReceipt ? null : closeCamera())}
      >
        <View className="flex-1 bg-black">
          {cameraPermission?.granted ? (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          ) : (
            <View className="flex-1 items-center justify-center px-6">
              <Text className="text-white text-base text-center">Camera permission is required.</Text>
              <Pressable
                onPress={async () => {
                  const res = await requestCameraPermission()
                  if (res.granted) setPendingCameraOpen(true)
                }}
                className="mt-4 rounded-xl bg-white px-4 py-3"
              >
                <Text className="text-black font-semibold">Grant permission</Text>
              </Pressable>
            </View>
          )}

          <View className="absolute bottom-0 left-0 right-0 p-5">
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={closeCamera}
                disabled={scanningReceipt}
                className={scanningReceipt ? 'rounded-xl bg-white/20 px-4 py-3' : 'rounded-xl bg-white/30 px-4 py-3'}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (scanningReceipt) return
                  if (!cameraPermission?.granted) return
                  const pic = await cameraRef.current?.takePictureAsync?.({ quality: 0.75, skipProcessing: true })
                  if (!pic?.uri) return
                  await scanReceiptFromUri(pic.uri)
                }}
                disabled={scanningReceipt}
                className={scanningReceipt ? 'rounded-full bg-white/40 px-6 py-4' : 'rounded-full bg-white px-6 py-4'}
              >
                <View className="flex-row items-center justify-center gap-2">
                  {scanningReceipt && <ActivityIndicator color="#111827" />}
                  <Text className="text-black font-semibold">{scanningReceipt ? 'Scanning…' : 'Capture'}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeScreen>
  )
}

export default Subscriptions