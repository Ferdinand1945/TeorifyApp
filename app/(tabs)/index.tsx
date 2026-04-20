import "@/global.css";

import ListHeading from "@/components/ListHeading";
import { SafeScreen } from "@/components/SafeScreen";
import UpcomingSubscriptionCard from "@/components/UpcomingSubscriptionCard";
import { HOME_BALANCE, HOME_USER, UPCOMING_SUBSCRIPTIONS } from "@/constants/data";
import images from "@/constants/images";
import { formatCurrency } from "@/lib/utils";
import dayjs from "dayjs";
import { FlatList, Image, Text, View } from "react-native";
export default function Index() {
  return (
    <SafeScreen className="flex-1 bg-background p-5"> 
      <View className="home-header">
        <View className="home-user">
          <Image source={images.avatar} className="home-avatar" />
          <Text className="home-user-name">{HOME_USER.name}</Text>
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

      <View>
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
      <View>
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
    </SafeScreen>
  );
}
