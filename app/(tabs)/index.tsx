import "@/global.css";

import ListHeading from "@/components/ListHeading";
import { SafeScreen } from "@/components/SafeScreen";
import SubscriptionCard from "@/components/SubscriptionCard";
import UpcomingSubscriptionCard from "@/components/UpcomingSubscriptionCard";
import { HOME_BALANCE, HOME_SUBSCRIPTIONS, HOME_USER, UPCOMING_SUBSCRIPTIONS } from "@/constants/data";
import images from "@/constants/images";
import { formatCurrency } from "@/lib/utils";
import { useUser } from "@clerk/expo";
import dayjs from "dayjs";
import { useState } from "react";
import { FlatList, Image, Text, View } from "react-native";
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
      data={HOME_SUBSCRIPTIONS}
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
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text className="list-empty">No subscriptions</Text>}
      />
     
      </View>
    </SafeScreen>
  );
}
