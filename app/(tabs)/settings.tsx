import { SafeScreen } from "@/components/SafeScreen";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { useClerk, useUser } from "@clerk/expo";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

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
  const authedFetch = useAuthedFetch();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type Household = {
    _id: string;
    name: string;
    joinCode: string;
  };

  const [loadingHouseholds, setLoadingHouseholds] = useState(false);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const activeHousehold = useMemo(
    () => households.find((h) => h._id === activeHouseholdId) ?? null,
    [activeHouseholdId, households],
  );

  async function refreshHouseholds() {
    setLoadingHouseholds(true);
    try {
      const [hhRes, activeRes] = await Promise.all([
        authedFetch("/households"),
        authedFetch("/settings/active-household"),
      ]);
      if (hhRes.ok) {
        const json = (await hhRes.json()) as { items: Household[] };
        setHouseholds(json.items || []);
      }
      if (activeRes.ok) {
        const json = (await activeRes.json()) as { householdId: string | null };
        setActiveHouseholdId(json.householdId ?? null);
      }
    } finally {
      setLoadingHouseholds(false);
    }
  }

  useEffect(() => {
    refreshHouseholds().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setActive(householdId: string | null) {
    const res = await authedFetch("/settings/active-household", {
      method: "PUT",
      body: JSON.stringify({ householdId }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      Alert.alert("Failed", txt || "Could not change active household.");
      return;
    }
    const json = (await res.json()) as { householdId: string | null };
    setActiveHouseholdId(json.householdId ?? null);
  }

  async function createHousehold() {
    const name = createName.trim();
    if (!name) return;
    const res = await authedFetch("/households", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      Alert.alert("Failed to create household", txt || `Request failed (${res.status})`);
      return;
    }
    setCreateName("");
    await refreshHouseholds();
  }

  async function joinHousehold() {
    const code = joinCode.trim();
    if (!code) return;
    const res = await authedFetch("/households/join", { method: "POST", body: JSON.stringify({ code }) });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      Alert.alert("Failed to join household", txt || `Request failed (${res.status})`);
      return;
    }
    setJoinCode("");
    await refreshHouseholds();
  }

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
    <SafeScreen className="flex-1 bg-[#EEEAE2] px-5 pt-6">
      <View className="mb-6">
        <Text className="text-2xl font-sans-bold text-primary">Settings</Text>
        <Text className="mt-1 text-sm font-sans-medium text-muted-foreground">
          Signed in as {user?.primaryEmailAddress?.emailAddress ?? "—"}
        </Text>
      </View>

      <View className="mb-5 rounded-3xl border border-border bg-card p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-sans-bold text-black">Household</Text>
          <Pressable onPress={refreshHouseholds} disabled={loadingHouseholds}>
            <Text className="text-primary font-semibold">{loadingHouseholds ? "Refreshing…" : "Refresh"}</Text>
          </Pressable>
        </View>

        <Text className="mt-2 text-sm font-sans-medium text-muted-foreground">
          Active: {activeHousehold ? `${activeHousehold.name} (code: ${activeHousehold.joinCode})` : "Personal"}
        </Text>

        <View className="mt-4 gap-2">
          <Pressable
            className={["rounded-2xl px-4 py-3", activeHouseholdId === null ? "bg-primary" : "bg-white"].join(" ")}
            onPress={() => setActive(null)}
          >
            <Text className={activeHouseholdId === null ? "text-white font-semibold" : "text-black font-semibold"}>
              Personal
            </Text>
          </Pressable>

          {households.map((h) => {
            const selected = h._id === activeHouseholdId;
            return (
              <Pressable
                key={h._id}
                className={["rounded-2xl px-4 py-3", selected ? "bg-primary" : "bg-white"].join(" ")}
                onPress={() => setActive(h._id)}
              >
                <Text className={selected ? "text-white font-semibold" : "text-black font-semibold"}>{h.name}</Text>
                <Text className={selected ? "text-white/80 text-xs" : "text-gray-500 text-xs"}>
                  Join code: {h.joinCode}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-4">
          <Text className="text-sm font-sans-medium text-muted-foreground mb-2">Create household</Text>
          <View className="flex-row gap-2">
            <TextInput
              value={createName}
              onChangeText={setCreateName}
              placeholder="Name (e.g. Home)"
              className="flex-1 rounded-2xl bg-white px-4 py-3"
            />
            <Pressable
              className={["rounded-2xl bg-primary px-4 py-3", !createName.trim() ? "opacity-50" : ""].join(" ")}
              disabled={!createName.trim()}
              onPress={createHousehold}
            >
              <Text className="text-white font-semibold">Create</Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-4">
          <Text className="text-sm font-sans-medium text-muted-foreground mb-2">Join household</Text>
          <View className="flex-row gap-2">
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Enter join code"
              autoCapitalize="characters"
              className="flex-1 rounded-2xl bg-white px-4 py-3"
            />
            <Pressable
              className={["rounded-2xl bg-primary px-4 py-3", !joinCode.trim() ? "opacity-50" : ""].join(" ")}
              disabled={!joinCode.trim()}
              onPress={joinHousehold}
            >
              <Text className="text-white font-semibold">Join</Text>
            </Pressable>
          </View>
        </View>
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