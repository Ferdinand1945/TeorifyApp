import { SafeScreen } from '@/components/SafeScreen'
import SubscriptionCard from '@/components/SubscriptionCard'
import { HOME_SUBSCRIPTIONS } from '@/constants/data'
import React, { useState } from 'react'
import { FlatList, Text, View } from 'react-native'

const Subscriptions = () => {
  const [expandedSubscription, setExpandedSubscription] = useState<string | null>(null)
  return (
    <SafeScreen>
      <FlatList 
        showsVerticalScrollIndicator={false} 
        data={HOME_SUBSCRIPTIONS} 
        renderItem={({item}) => ( 
          <SubscriptionCard 
            expanded={expandedSubscription === item.id} 
            onPress={() => setExpandedSubscription((currentId) => currentId === item.id ? null : item.id)} 
            {...item}
          />
        )}
        keyExtractor={(item) => item.id} 
        ItemSeparatorComponent={() => <View className="h-4" />} 
        ListEmptyComponent={<Text className="text-center text-sm text-gray-500">No subscriptions found</Text>} 
        ListHeaderComponent={<Text className="text-center text-xl text-black mt-4 mb-10">All subscriptions</Text>}
        extraData={expandedSubscription}
        ListFooterComponent={<Text className="text-center text-sm text-gray-500">No more subscriptions</Text>}
      />
    </SafeScreen>
  )
}

export default Subscriptions