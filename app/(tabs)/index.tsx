import "@/global.css";

import ListHeading from "@/components/ListHeading";
import { SafeScreen } from "@/components/SafeScreen";
import SubscriptionCard from "@/components/SubscriptionCard";
import UpcomingSubscriptionCard from "@/components/UpcomingSubscriptionCard";
import { HOME_BALANCE, HOME_USER, UPCOMING_SUBSCRIPTIONS } from "@/constants/data";
import { icons } from "@/constants/icons";
import images from "@/constants/images";
import { invalidateApiCache, useAuthedFetch } from "@/hooks/useAuthedFetch";
import { formatCurrency } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/expo";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";

type ApiSubscription = {
  _id: string;
  userId: string;
  name: string;
  amountCents: number;
  currency: string;
  billingCycle: "weekly" | "monthly" | "yearly";
  nextBillingDate: string;
  categoryId?: string | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiCategory = {
  _id: string;
  userId: string;
  name: string;
  kind: "subscription" | "expense" | "income";
  createdAt: string;
  updatedAt: string;
};

type SummaryTotalsRow = {
  currency: string;
  spendsTotalCents: number;
  subscriptionsMonthlyEquivalentCents: number;
  totalCents: number;
};

type ApiSpend = {
  _id: string;
  userId: string;
  title: string;
  type: "expense" | "income";
  amountCents: number;
  currency: string;
  occurredAt: string;
  renewalAt?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};
/**
 * Display the authenticated home screen with user header, balance summary, recent spends, upcoming subscriptions, and the full subscription list including a modal to create a new spend.
 *
 * Handles auth gating, initial data loading and refresh, per-item deletion workflows, subscription card expansion state, and the new-spend creation flow.
 *
 * @returns The root JSX element for the home screen
 */
export default function Index() {
  const [expandedSubscription, setExpandedSubscription] = useState<string | null>(null);
  const { user } = useUser()
  const { isLoaded, isSignedIn } = useAuth()
  const authedFetch = useAuthedFetch()

  const [subs, setSubs] = useState<ApiSubscription[]>([])
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [monthTotals, setMonthTotals] = useState<SummaryTotalsRow[]>([])
  const [recentSpends, setRecentSpends] = useState<ApiSpend[]>([])
  const [deletingSpendId, setDeletingSpendId] = useState<string | null>(null)
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null)

  const [spendModalOpen, setSpendModalOpen] = useState(false)
  const [savingSpend, setSavingSpend] = useState(false)
  const [datePicker, setDatePicker] = useState<null | { field: "occurredAt" | "renewalAt"; value: Date }>(null)
  const [spendForm, setSpendForm] = useState({
    title: "",
    amount: "",
    currency: "USD",
    occurredAt: null as Date | null,
    renewalAt: null as Date | null,
    categoryId: null as string | null,
    notes: "",
  })

  const loadRecentSpends = useCallback(
    async (from: string) => {
      const spendsRes = await authedFetch(`/spends?from=${from}`)
      if (!spendsRes.ok) return
      const spendsJson = (await spendsRes.json()) as { items: ApiSpend[] }
      setRecentSpends((spendsJson.items || []).slice(0, 6))
    },
    [authedFetch],
  )

  const loadMonthSummary = useCallback(
    async (month: string) => {
      const summaryRes = await authedFetch(`/summary/month?month=${month}`)
      if (!summaryRes.ok) return
      const summaryJson = (await summaryRes.json()) as { month: string; totals: SummaryTotalsRow[] }
      setMonthTotals(summaryJson.totals || [])
    },
    [authedFetch],
  )

  const load = useCallback(async () => {
    setError(null)
    try {
      const month = dayjs().format("YYYY-MM")
      const from = dayjs().startOf("month").format("YYYY-MM-DD")
      const [subsRes, catsRes, summaryRes, spendsRes] = await Promise.all([
        authedFetch("/subscriptions"),
        authedFetch("/categories"),
        authedFetch(`/summary/month?month=${month}`),
        authedFetch(`/spends?from=${from}`),
      ])

      if (!subsRes.ok) {
        const txt = await subsRes.text()
        throw new Error(txt || `Request failed (${subsRes.status})`)
      }
      const subsJson = (await subsRes.json()) as { items: ApiSubscription[] }
      setSubs(subsJson.items || [])

      if (catsRes.ok) {
        const catsJson = (await catsRes.json()) as { items: ApiCategory[] }
        setCategories(catsJson.items || [])
        if ((catsJson.items || []).length === 0) {
          const seeded = await authedFetch("/categories/seed", { method: "POST" })
          if (seeded.ok) {
            const seededJson = (await seeded.json()) as { items: ApiCategory[] }
            setCategories(seededJson.items || [])
          }
        }
      }

      if (summaryRes.ok) {
        const summaryJson = (await summaryRes.json()) as { month: string; totals: SummaryTotalsRow[] }
        setMonthTotals(summaryJson.totals || [])
      }

      if (spendsRes.ok) {
        const spendsJson = (await spendsRes.json()) as { items: ApiSpend[] }
        setRecentSpends((spendsJson.items || []).slice(0, 6))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subscriptions")
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  const deleteSpend = async (spend: ApiSpend) => {
    if (deletingSpendId) return
    Alert.alert("Delete spend?", spend.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeletingSpendId(spend._id)
          const watchdog = setTimeout(() => {
            setDeletingSpendId((cur) => (cur === spend._id ? null : cur))
          }, 20_000)
          try {
            // eslint-disable-next-line no-console
            console.log("[spends] deleting", spend._id)
            const res = await authedFetch(`/spends/${spend._id}`, { method: "DELETE" })
            // eslint-disable-next-line no-console
            console.log("[spends] delete response", res.status)
            if (!res.ok && res.status !== 204) {
              const txt = await res.text()
              throw new Error(txt || `Request failed (${res.status})`)
            }
            setRecentSpends((cur) => cur.filter((s) => s._id !== spend._id))
            invalidateApiCache(['/spends', '/summary'])

            // Fast refresh: only the parts that change.
            const month = dayjs().format("YYYY-MM")
            const from = dayjs().startOf("month").format("YYYY-MM-DD")
            await Promise.all([loadMonthSummary(month), loadRecentSpends(from)])
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error"
            Alert.alert("Delete failed", msg.includes("aborted") ? "Request timed out. Check EXPO_PUBLIC_API_URL." : msg)
          } finally {
            clearTimeout(watchdog)
            setDeletingSpendId(null)
          }
        },
      },
    ])
  }

  const deleteSubscription = async (subId: string, subName: string) => {
    if (deletingSubId) return
    Alert.alert("Delete subscription?", subName, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeletingSubId(subId)
          const watchdog = setTimeout(() => {
            setDeletingSubId((cur) => (cur === subId ? null : cur))
          }, 20_000)
          try {
            const res = await authedFetch(`/subscriptions/${subId}`, { method: "DELETE" })
            if (!res.ok && res.status !== 204) {
              const txt = await res.text()
              throw new Error(txt || `Request failed (${res.status})`)
            }
            setSubs((cur) => cur.filter((s) => s._id !== subId))
            setExpandedSubscription((cur) => (cur === subId ? null : cur))
            invalidateApiCache(['/subscriptions', '/summary'])
            await loadMonthSummary(dayjs().format("YYYY-MM"))
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error"
            Alert.alert("Delete failed", msg.includes("aborted") ? "Request timed out. Check EXPO_PUBLIC_API_URL." : msg)
          } finally {
            clearTimeout(watchdog)
            setDeletingSubId(null)
          }
        },
      },
    ])
  }

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setSubs([])
      setRefreshing(false)
      setLoading(false)
      setError("Please sign in to view subscriptions.")
      return
    }
    load()
  }, [isLoaded, isSignedIn, load])

  const iconForName = useCallback((name: string) => {
    const n = name.toLowerCase()
    if (n.includes("spotify")) return icons.spotify
    if (n.includes("notion")) return icons.notion
    if (n.includes("figma")) return icons.figma
    if (n.includes("github")) return icons.github
    if (n.includes("adobe")) return icons.adobe
    if (n.includes("claude")) return icons.claude
    if (n.includes("canva")) return icons.canva
    if (n.includes("openai")) return icons.openai
    if (n.includes("dropbox")) return icons.dropbox
    if (n.includes("medium")) return icons.medium
    return icons.wallet
  }, [])

  const uiSubs: Subscription[] = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c._id, c.name]))
    return subs.map((s) => ({
      id: s._id,
      icon: iconForName(s.name),
      name: s.name,
      plan: s.notes || undefined,
      category: s.categoryId ? catMap.get(s.categoryId) || "" : "",
      paymentMethod: "",
      status: s.isActive ? "active" : "paused",
      startDate: s.createdAt,
      price: s.amountCents / 100,
      currency: s.currency,
      billing:
        s.billingCycle === "yearly"
          ? "Yearly"
          : s.billingCycle === "weekly"
            ? "Weekly"
            : "Monthly",
      renewalDate: s.nextBillingDate,
      color: undefined,
    }))
  }, [categories, iconForName, subs])

  const onRefresh = async () => {
    if (!isLoaded || !isSignedIn) return
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const currentMonthTotalLabel = useMemo(() => {
    if (monthTotals.length === 0) return null
    // If multiple currencies, show the first one for now.
    const first = monthTotals[0]
    const amount = first.totalCents / 100
    return `${formatCurrency(amount, first.currency)}`
  }, [monthTotals])

  const openSpendModal = () => {
    setSpendForm({
      title: "",
      amount: "",
      currency: "USD",
      occurredAt: null,
      renewalAt: null,
      categoryId: null,
      notes: "",
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
        type: "expense",
        amountCents: Math.round(amountNumber * 100),
        currency: spendForm.currency.trim().toUpperCase(),
        categoryId: spendForm.categoryId,
        notes: spendForm.notes.trim() ? spendForm.notes.trim() : null,
        occurredAt: spendForm.occurredAt ? dayjs(spendForm.occurredAt).format("YYYY-MM-DD") : undefined,
        renewalAt: spendForm.renewalAt ? dayjs(spendForm.renewalAt).format("YYYY-MM-DD") : undefined,
      }

      const res = await authedFetch("/spends", { method: "POST", body: JSON.stringify(payload) })
      if (res.ok) {
        setSpendModalOpen(false)
        invalidateApiCache(['/spends', '/summary'])
        await load()
      }
    } finally {
      setSavingSpend(false)
    }
  }
  return (
    <SafeScreen className="flex-1 bg-background p-5"> 
      <View>
      <FlatList 
      ListHeaderComponent={()=> (
        <>
        <View className="home-header">
        <View className="home-user">
          <Image source={{ uri: user?.imageUrl }} className="home-avatar" />
          {user?.fullName ? <Text className="home-user-name">{user?.fullName}</Text> : <Text className="home-user-name">{user?.primaryEmailAddress?.emailAddress}</Text>}
        </View> 
        <Pressable onPress={openSpendModal} hitSlop={10}>
          <Image source={images.add} className="home-add-icon" />
        </Pressable>
        </View>

        <View className="home-balance-card">
          <Text className="home-balance-label">Welcome back, {HOME_USER.name}</Text>

          <View className="home-balance-row">
            <Text className="home-balance-amount">
              {currentMonthTotalLabel ? currentMonthTotalLabel : formatCurrency(HOME_USER.amount)}
            </Text>
            <Text className="home-balance-date">{dayjs(HOME_BALANCE.nextRenewalDate).format("MM/DD/YYYY")}</Text>
          </View>
        </View>

        <View className="mt-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-sans-bold text-primary">Recent spends</Text>
            <Text className="text-sm font-sans-medium text-muted-foreground">
              {dayjs().format("MMM YYYY")}
            </Text>
          </View>
          {recentSpends.length === 0 ? (
            <Text className="home-empty-state">No spends yet</Text>
          ) : (
            <View className="mt-3 gap-2">
              {recentSpends.map((s) => (
                <View
                  key={s._id}
                  className="flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-sans-bold text-primary" numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text className="text-sm font-sans-medium text-muted-foreground" numberOfLines={1}>
                      {dayjs(s.occurredAt).format("MMM D")} {s.renewalAt ? `• renew ${dayjs(s.renewalAt).format("MMM D")}` : ""}
                    </Text>
                  </View>
                  <View className="ml-3 items-end">
                    <Text className="text-base font-sans-bold text-primary">
                      {formatCurrency(s.amountCents / 100, s.currency)}
                    </Text>
                    <Pressable
                      onPress={() => deleteSpend(s)}
                      disabled={deletingSpendId === s._id}
                      hitSlop={10}
                      className={deletingSpendId === s._id ? "mt-1 rounded-full bg-destructive/60 px-3 py-1" : "mt-1 rounded-full bg-destructive px-3 py-1"}
                    >
                      <View className="flex-row items-center justify-center gap-2">
                        {deletingSpendId === s._id && <ActivityIndicator color="#fff" size="small" />}
                        <Text className="text-xs font-sans-semibold text-white">
                          {deletingSpendId === s._id ? "Deleting…" : "Delete"}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View className="mb-5">
          <ListHeading title="Listheading" />
          <FlatList 
            data={UPCOMING_SUBSCRIPTIONS}
            renderItem={({item}) => (
              <UpcomingSubscriptionCard {...item}/>
            )}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            ListEmptyComponent={<Text className="list-empty">No upcoming subscriptions</Text>}
        />
        </View>

        <ListHeading title="All subscriptions" />
      </>
      )}
      data={uiSubs}
      renderItem={({item}) => ( 
      <SubscriptionCard 
        expanded={expandedSubscription === item.id} 
        onPress={() => setExpandedSubscription((currentId) => currentId === item.id ? null : item.id)} 
        onDeletePress={() => deleteSubscription(item.id, item.name)}
        isDeleting={deletingSubId === item.id}
        {...item}
      />
      )}
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View className="h-4" />}
      extraData={expandedSubscription}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        loading ? (
          <Text className="list-empty">Loading…</Text>
        ) : error ? (
          <Text className="list-empty">{error}</Text>
        ) : (
          <Text className="list-empty">No subscriptions</Text>
        )
      }
      />
     
      <Modal
        visible={spendModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSpendModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 bg-[#F6F7FF] p-5"
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-xl font-semibold text-black">New spend</Text>
            <Pressable onPress={() => (savingSpend ? null : setSpendModalOpen(false))} hitSlop={10} disabled={savingSpend}>
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
                  keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
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
                      field: "occurredAt",
                      value: spendForm.occurredAt ?? new Date(),
                    })
                  }
                  className="flex-1 rounded-xl bg-white px-4 py-3"
                >
                  <Text className="text-black">
                    {spendForm.occurredAt ? dayjs(spendForm.occurredAt).format("YYYY-MM-DD") : "Not set"}
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
                      field: "renewalAt",
                      value: spendForm.renewalAt ?? new Date(),
                    })
                  }
                  className="flex-1 rounded-xl bg-white px-4 py-3"
                >
                  <Text className="text-black">
                    {spendForm.renewalAt ? dayjs(spendForm.renewalAt).format("YYYY-MM-DD") : "Not set"}
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
                  <Pressable
                    onPress={() => setSpendForm((f) => ({ ...f, categoryId: null }))}
                    className="rounded-full bg-gray-100 px-3 py-2"
                  >
                    <Text className="text-black">None</Text>
                  </Pressable>
                  {categories
                    .filter((c) => c.kind === "expense" || c.kind === "subscription")
                    .map((c) => (
                      <Pressable
                        key={c._id}
                        onPress={() => setSpendForm((f) => ({ ...f, categoryId: c._id }))}
                        className={
                          c._id === spendForm.categoryId
                            ? "rounded-full bg-primary px-3 py-2"
                            : "rounded-full bg-gray-100 px-3 py-2"
                        }
                      >
                        <Text className={c._id === spendForm.categoryId ? "text-white" : "text-black"}>
                          {c.name}
                        </Text>
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
            <Pressable
              onPress={() => setSpendModalOpen(false)}
              className="flex-1 rounded-xl bg-gray-200 px-4 py-3"
              disabled={savingSpend}
            >
              <Text className="text-center font-semibold text-black">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submitSpend}
              className={savingSpend ? "flex-1 rounded-xl bg-primary/70 px-4 py-3" : "flex-1 rounded-xl bg-primary px-4 py-3"}
              disabled={savingSpend}
            >
              <View className="flex-row items-center justify-center gap-2">
                {savingSpend && <ActivityIndicator color="#fff" />}
                <Text className="text-center font-semibold text-white">{savingSpend ? "Saving..." : "Save"}</Text>
              </View>
            </Pressable>
          </View>

          {datePicker && (
            <DateTimePicker
              value={datePicker.value}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_event, selected) => {
                if (Platform.OS !== "ios") setDatePicker(null)
                if (!selected) return
                setSpendForm((f) =>
                  datePicker.field === "occurredAt" ? { ...f, occurredAt: selected } : { ...f, renewalAt: selected },
                )
              }}
            />
          )}
        </KeyboardAvoidingView>
      </Modal>
      </View>
    </SafeScreen>
  );
}
