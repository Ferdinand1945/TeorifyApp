import "@/global.css";

import ListHeading from "@/components/ListHeading";
import { SafeScreen } from "@/components/SafeScreen";
import SubscriptionCard from "@/components/SubscriptionCard";
import UpcomingSubscriptionCard from "@/components/UpcomingSubscriptionCard";
import { HOME_BALANCE, HOME_USER, UPCOMING_SUBSCRIPTIONS } from "@/constants/data";
import { icons } from "@/constants/icons";
import images from "@/constants/images";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { formatCurrency } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/expo";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, RefreshControl, Text, View } from "react-native";

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
/**
 * Renders the home screen with user header, balance summary, upcoming subscriptions, and a list of all subscriptions.
 *
 * The component sources the authenticated user from Clerk for the avatar and display name, manages which subscription card is expanded, and presents upcoming subscriptions in a horizontal list and all subscriptions in a vertical list.
 *
 * @returns The JSX element for the home screen layout
 */
export default function Index() {
  const [expandedSubscription, setExpandedSubscription] = useState<string | null>(null);
  const { user } = useUser()
  const { isLoaded, isSignedIn } = useAuth()
  const authedFetch = useAuthedFetch()

  const [subs, setSubs] = useState<ApiSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await authedFetch("/subscriptions")
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Request failed (${res.status})`)
      }
      const json = (await res.json()) as { items: ApiSubscription[] }
      setSubs(json.items || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subscriptions")
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
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
    return subs.map((s) => ({
      id: s._id,
      icon: iconForName(s.name),
      name: s.name,
      plan: s.notes || undefined,
      category: "",
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
  }, [iconForName, subs])

  const onRefresh = async () => {
    if (!isLoaded || !isSignedIn) return
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
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
        <Image source={images.add} className="home-add-icon" />
        </View>

        <View className="home-balance-card">
          <Text className="home-balance-label">Welcome back, {HOME_USER.name}</Text>

          <View className="home-balance-row">
            <Text className="home-balance-amount">{formatCurrency(HOME_USER.amount)}</Text>
            <Text className="home-balance-date">{dayjs(HOME_BALANCE.nextRenewalDate).format("MM/DD/YYYY")}</Text>
          </View>
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
     
      </View>
    </SafeScreen>
  );
}
