import "@/global.css";
import { Link } from "expo-router";

import { SafeScreen } from "@/components/SafeScreen";
import { Pressable, Text } from "react-native";

export default function Index() {
  return (
    <SafeScreen className="p-5">
      <Text className="text-xl font-bold text-blue-500 font-sans-bold">Welcome to Nativewind!</Text>

      <Link href="/onboarding" asChild>
        <Pressable className="mt-4 rounded bg-blue-500 px-4 py-3">
          <Text className="text-white font-semibold">Onboarding</Text>
        </Pressable>
      </Link>
      <Link href="/(auth)/sign-up" asChild>
        <Pressable className="mt-4 rounded bg-blue-500 px-4 py-3">
          <Text className="text-white font-semibold">SignUp</Text>
        </Pressable>
      </Link>
      <Link href="/(auth)/sign-in" asChild>
        <Pressable className="mt-4 rounded bg-blue-500 px-4 py-3">
          <Text className="text-white font-semibold">SignIn</Text>
        </Pressable>
      </Link>
      <Link href="/subscriptions/spotify" asChild>
        <Pressable className="mt-4 ">
          <Text className="text-white font-semibold">SignIn</Text>
        </Pressable>
      </Link>
      <Link href={{
        pathname: "/subscriptions/[id]",
        params: { id: "cloude" },
      }} asChild>
        <Pressable className="mt-4 ">
          <Text className="text-white font-semibold">SignIn</Text>
        </Pressable>
      </Link>
    
    </SafeScreen>
  );
}
