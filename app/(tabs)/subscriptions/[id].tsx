import { Link, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

const SubscriptionDetails = () => {
    const {id} = useLocalSearchParams<{id: string}>();
  return (
    <View>
      <Text>SubscriptionDetails {id}</Text>
      <Link href="/">Back Home</Link>
    </View>
  )
}

export default SubscriptionDetails