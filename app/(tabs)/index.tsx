import "@/global.css";

import NewSpendModal from "@/components/NewSpendModal";
import ExpandableSpendCard from "@/components/ExpandableSpendCard";
import { SafeScreen } from "@/components/SafeScreen";
import { HOME_USER } from "@/constants/data";
import { iconSourceForServiceKey, labelForServiceKey } from "@/lib/spendDisplay";
import { syncSubscriptionReminders, cancelReminderForSpendId } from "@/lib/subscriptionReminders";
import { invalidateApiCache, useAuthedFetch } from "@/hooks/useAuthedFetch";
import { formatCurrency } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
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
  serviceKey?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};
/**
 * Render the authenticated home screen with user header, balance, recent spends, upcoming subscriptions, and a full subscription list including a modal to create a new spend.
 *
 * Handles authentication gating, initial and pull-to-refresh data loading, per-item deletion workflows, and subscription card expansion state.
 *
 * @returns The root JSX element for the home screen
 */
export default function Index() {
  const { user } = useUser()
  const { isLoaded, isSignedIn } = useAuth()
  const authedFetch = useAuthedFetch()

  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [monthTotals, setMonthTotals] = useState<SummaryTotalsRow[]>([])
  const [recentSpends, setRecentSpends] = useState<ApiSpend[]>([])
  const [expandedSpendId, setExpandedSpendId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [spendModalOpen, setSpendModalOpen] = useState(false)
  const load = useCallback(async () => {
    setError(null)
    try {
      const month = dayjs().format("YYYY-MM")
      const from = dayjs().startOf("month").format("YYYY-MM-DD")
      const [catsRes, summaryRes, recentRes, allSpendsRes] = await Promise.all([
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

      if (allSpendsRes.ok) {
        const allJson = (await allSpendsRes.json()) as { items: ApiSpend[] }
        await syncSubscriptionReminders(allJson.items || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subscriptions")
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  const deleteOne = useCallback(
    async (spend: ApiSpend) => {
      Alert.alert("Delete spend?", spend.title, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            let watchdogId: ReturnType<typeof setTimeout> | null = null
            try {
              setDeletingId(spend._id)
              watchdogId = setTimeout(() => {
                setDeletingId((cur) => (cur === spend._id ? null : cur))
              }, 20_000)
              const res = await authedFetch(`/spends/${spend._id}`, { method: "DELETE" })
              if (!res.ok && res.status !== 204) {
                const txt = await res.text()
                throw new Error(txt || `Request failed (${res.status})`)
              }
              invalidateApiCache(["/spends", "/summary"])
              await cancelReminderForSpendId(spend._id)
              setExpandedSpendId((cur) => (cur === spend._id ? null : cur))
              await load()
              Alert.alert("Deleted", `${spend.title} was deleted.`)
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Unknown error"
              Alert.alert("Delete failed", msg.includes("aborted") ? "Request timed out. Check EXPO_PUBLIC_API_URL." : msg)
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

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setRecentSpends([])
      setLoading(false)
      setError("Please sign in to view home.")
      return
    }
    load()
  }, [isLoaded, isSignedIn, load])

  // Pull-to-refresh is implemented on other screens.

  const currentMonthTotalLabel = useMemo(() => {
    if (monthTotals.length === 0) return null
    // If multiple currencies, show the first one for now.
    const first = monthTotals[0]
    const amount = first.totalCents / 100
    return `${formatCurrency(amount, first.currency)}`
  }, [monthTotals])

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c._id, c.name])), [categories])

  const openSpendModal = () => {
    setSpendModalOpen(true)
  }
  return (
    <SafeScreen className="flex-1 bg-[#EEEAE2]">
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="px-5 pt-6"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <View className="flex-row items-center justify-between">
          <Image source={{ uri: user?.imageUrl }} className="h-12 w-12 rounded-full" />
          <Pressable className="h-11 w-11 items-center justify-center rounded-2xl bg-[#E6E0D7]" hitSlop={10}>
            <Ionicons name="notifications-outline" size={20} color="#111827" />
          </Pressable>
        </View>

        <Text className="mt-4 text-3xl font-sans-extrabold text-black" numberOfLines={2}>
          Welcome back, {user?.firstName || user?.fullName || "Friend"}
        </Text>

        <View
          className="mt-4 rounded-3xl px-6 py-6"
          style={{
            backgroundColor: "#84AE93",
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <Text className="text-sm font-sans-semibold text-white/90">Your Balance</Text>
          <Text className="mt-2 text-4xl font-sans-extrabold text-white">
            {currentMonthTotalLabel ? currentMonthTotalLabel : formatCurrency(HOME_USER.amount)}
          </Text>
          <Text className="mt-2 text-sm font-sans-semibold text-white/90">{dayjs().format("MMMM D, YYYY")}</Text>
        </View>

        <View className="mt-6">
          <Text className="text-xl font-sans-extrabold text-black">Recent Spends</Text>
          <View className="mt-4 gap-4">
            {recentSpends.slice(0, 3).map((s) => (
              <ExpandableSpendCard
                key={s._id}
                spend={{
                  title: s.title,
                  type: s.type,
                  amountCents: s.amountCents,
                  currency: s.currency,
                  occurredAt: s.occurredAt,
                  renewalAt: s.renewalAt,
                  categoryLabel: s.categoryId ? categoryNameById.get(s.categoryId) || "Uncategorized" : "Uncategorized",
                  serviceKeyLabel: labelForServiceKey(s.serviceKey),
                  notes: s.notes,
                }}
                icon={iconSourceForServiceKey(s.serviceKey)}
                expanded={expandedSpendId === s._id}
                onToggle={() => setExpandedSpendId((id) => (id === s._id ? null : s._id))}
                onDeletePress={() => deleteOne(s)}
                isDeleting={deletingId === s._id}
              />
            ))}

            <Pressable
              onPress={openSpendModal}
              className="mt-2 self-end flex-row items-center gap-3 rounded-full bg-[#2F9C8A] px-5 py-4"
              style={{ shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Text className="text-white text-xl leading-none">+</Text>
              </View>
              <Text className="text-white font-sans-extrabold">Add spend</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <NewSpendModal
        visible={spendModalOpen}
        onRequestClose={() => setSpendModalOpen(false)}
        authedFetch={authedFetch}
        categories={categories}
        onSaved={load}
        initialOccurredAt={new Date()}
      />
    </SafeScreen>
  );
}
