import { SafeScreen } from "@/components/SafeScreen";
import { useClerk, useUser } from "@clerk/expo";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/**
 * Renders the Settings screen showing the current user's email and a sign-out control.
 *
 * Displays the signed-in user's primary email (or "—" if unavailable), provides a "Sign out" button
 * that shows a loading indicator while sign-out is in progress, and displays any sign-out error message.
 *
 * @returns A React element rendering the settings screen UI.
 */
export default function Settings() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initiates the sign-out flow, updates the component's submitting state while the operation runs,
   * and records a user-facing error message if sign-out fails.
   *
   * On failure, sets the error state to the caught error's `message` when the error is an `Error`,
   * otherwise sets `"Could not sign out. Please try again."`. Always resets the submitting state when finished.
   */
  async function onSignOut() {
    setError(null);
    try {
      setSubmitting(true);
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeScreen className="flex-1 bg-background px-5 pt-6">
      <View className="mb-6">
        <Text className="text-2xl font-sans-bold text-primary">Settings</Text>
        <Text className="mt-1 text-sm font-sans-medium text-muted-foreground">
          Signed in as {user?.primaryEmailAddress?.emailAddress ?? "—"}
        </Text>
      </View>

      <View className="rounded-3xl border border-border bg-card p-5">
        <Text className="text-sm font-sans-medium text-muted-foreground">
          You can sign out anytime. Your data stays on this device unless you choose to sync.
        </Text>

        {!!error && (
          <Text className="mt-3 text-xs font-sans-medium text-destructive">{error}</Text>
        )}

        <Pressable
          className={[
            "mt-5 items-center rounded-2xl bg-primary py-4",
            submitting ? "opacity-60" : null,
          ].join(" ")}
          onPress={onSignOut}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff9e3" />
          ) : (
            <Text className="font-sans-bold text-background">Sign out</Text>
          )}
        </Pressable>
      </View>
    </SafeScreen>
  );
}