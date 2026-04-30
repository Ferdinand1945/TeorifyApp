import "@/global.css";

import ListHeading from "@/components/ListHeading";
import NewSpendModal from "@/components/NewSpendModal";
import { SafeScreen } from "@/components/SafeScreen";
import SubscriptionCard from "@/components/SubscriptionCard";
import UpcomingSubscriptionCard from "@/components/UpcomingSubscriptionCard";
import { HOME_USER, UPCOMING_SUBSCRIPTIONS } from "@/constants/data";
import { icons } from "@/constants/icons";
import { invalidateApiCache, useAuthedFetch } from "@/hooks/useAuthedFetch";
import { formatCurrency } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/expo";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

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

  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [monthTotals, setMonthTotals] = useState<SummaryTotalsRow[]>([])
  const [recentSpends, setRecentSpends] = useState<ApiSpend[]>([])
  const [allSpends, setAllSpends] = useState<ApiSpend[]>([])
  const [deletingSpendId, setDeletingSpendId] = useState<string | null>(null)
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null)

  const [spendModalOpen, setSpendModalOpen] = useState(false)
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
      const [catsRes, summaryRes, recentRes, allRes] = await Promise.all([
        authedFetch("/categories"),
        authedFetch(`/summary/month?month=${month}`),
        authedFetch(`/spends?from=${from}`),
        authedFetch("/spends"),
      ])

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

      if (recentRes.ok) {
        const spendsJson = (await recentRes.json()) as { items: ApiSpend[] }
        setRecentSpends((spendsJson.items || []).slice(0, 6))
      }
      if (allRes.ok) {
        const allJson = (await allRes.json()) as { items: ApiSpend[] }
        setAllSpends(allJson.items || [])
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
            // Subscriptions are represented as spends with category.kind === "subscription"
            const res = await authedFetch(`/spends/${subId}`, { method: "DELETE" })
            if (!res.ok && res.status !== 204) {
              const txt = await res.text()
              throw new Error(txt || `Request failed (${res.status})`)
            }
            setAllSpends((cur) => cur.filter((s) => s._id !== subId))
            setExpandedSubscription((cur) => (cur === subId ? null : cur))
            invalidateApiCache(['/spends', '/summary'])
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
      setAllSpends([])
      setRecentSpends([])
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
    const catsById = new Map(categories.map((c) => [c._id, c]))
    return allSpends
      .filter((s) => {
        if (!s.categoryId) return false
        const c = catsById.get(s.categoryId)
        return c?.kind === "subscription"
      })
      .map((s) => {
        const c = s.categoryId ? catsById.get(s.categoryId) : undefined
        return {
          id: s._id,
          icon: iconForName(s.title),
          name: s.title,
          plan: s.notes || undefined,
          category: c?.name || "",
          paymentMethod: "",
          status: s.renewalAt ? "active" : "paused",
          startDate: s.occurredAt,
          price: s.amountCents / 100,
          currency: s.currency,
          billing: s.renewalAt ? "Recurring" : "One-time",
          renewalDate: s.renewalAt ?? undefined,
          color: undefined,
        }
      })
  }, [allSpends, categories, iconForName])

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
    setSpendModalOpen(true)
  }
  return (
    <SafeScreen className="flex-1 bg-white p-5 pb-24"> 
      <View>
      <FlatList 
      ListHeaderComponent={()=> (
        <>
        <View className="home-header">
        <View className="home-user">
          <Image source={{ uri: user?.imageUrl }} className="home-avatar" />
          {user?.fullName ? <Text className="home-user-name">{user?.fullName}</Text> : <Text className="home-user-name">{user?.primaryEmailAddress?.emailAddress}</Text>}
        </View> 
        <Pressable
          onPress={openSpendModal}
          hitSlop={10}
          className="h-11 w-11 items-center justify-center rounded-full bg-primary"
        >
          <Text className="text-white text-2xl leading-none">+</Text>
        </Pressable>
        </View>

        <View className="home-balance-card">
          <Text className="home-balance-label">Welcome back, {user?.fullName ? user?.fullName : user?.primaryEmailAddress?.emailAddress}</Text>

          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-sans-bold text-primary">Your balance</Text>
            <Text className="text-sm font-sans-medium text-muted-foreground">
              {dayjs().format("MMM YYYY")}
            </Text> 
          </View>
          <View className="home-balance-row">
            <Text className="home-balance-amount">
              {currentMonthTotalLabel ? currentMonthTotalLabel : formatCurrency(HOME_USER.amount)}
            </Text>
            <Text className="home-balance-date">{new Date().toLocaleDateString()}</Text>
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
          <ListHeading title="All spends" />
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
     
      <NewSpendModal
        visible={spendModalOpen}
        onRequestClose={() => setSpendModalOpen(false)}
        authedFetch={authedFetch}
        categories={categories}
        onSaved={load}
        initialOccurredAt={new Date()}
      />
      </View>
    </SafeScreen>
  );
}
