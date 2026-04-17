import { SafeScreen } from "@/components/SafeScreen";
import { Link, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text } from "react-native";

const SubscriptionDetails = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeScreen className="flex-1 items-center justify-center bg-background">
      <Text>SubscriptionDetails {id}</Text>
      <Link href="/">Back Home</Link>
    </SafeScreen>
  );
};

export default SubscriptionDetails