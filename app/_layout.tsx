import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import React, { useEffect } from "react";
import * as Notifications from "expo-notifications";
import "../global.css";
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

// Keep the splash screen visible while we load fonts.
// Required before calling `hideAsync()` to avoid iOS "No native splash screen registered" errors.
SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore: it can throw if called too late during fast refresh
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Root layout component that loads custom Plus Jakarta Sans fonts, hides the splash screen once fonts are ready, and provides Clerk authentication context for the app's navigation stack.
 *
 * @returns The React element containing a `ClerkProvider` that wraps the app's `Stack` navigation.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "PlusJakartaSans-Regular": require("../assets/fonts/PlusJakartaSans-Regular.ttf"),
    "PlusJakartaSans-Medium": require("../assets/fonts/PlusJakartaSans-Medium.ttf"),
    "PlusJakartaSans-SemiBold": require("../assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "PlusJakartaSans-Bold": require("../assets/fonts/PlusJakartaSans-Bold.ttf"),
    "PlusJakartaSans-ExtraBold": require("../assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    "PlusJakartaSans-Light": require("../assets/fonts/PlusJakartaSans-Light.ttf"),
  });

  useEffect(() => {
    if (!fontsLoaded) return
    SplashScreen.hideAsync().catch(() => {
      // ignore
    })
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>

      <Stack screenOptions={{ headerShown: false }} />
      </ClerkProvider>
  );
}
