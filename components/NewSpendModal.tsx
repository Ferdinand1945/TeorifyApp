import { invalidateApiCache } from "@/hooks/useAuthedFetch"
import { Ionicons } from "@expo/vector-icons"
import DateTimePicker from "@react-native-community/datetimepicker"
import { icons } from "@/constants/icons"
import dayjs from "dayjs"
import { CameraView, useCameraPermissions } from "expo-camera"
import { manipulateAsync, SaveFormat } from "expo-image-manipulator"
import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native"

export type SpendCategory = {
  _id: string
  kind: "subscription" | "expense" | "income"
  name: string
}

type Props = {
  visible: boolean
  onRequestClose: () => void
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>
  categories: SpendCategory[]
  onSaved?: () => void | Promise<void>
  initialOccurredAt?: Date | null
}

/**
 * Modal UI for creating a new spend entry, including optional service selection, receipt scanning, date picking, category selection with search, notes, and submission to the API.
 *
 * @param visible - Whether the modal is shown
 * @param onRequestClose - Callback invoked to request closing the modal
 * @param authedFetch - Authenticated fetch function used for API requests (receipt scan and submit)
 * @param categories - List of available spend categories (used for category picker; only `expense` and `subscription` kinds are shown)
 * @param onSaved - Optional callback invoked after a successful save
 * @param initialOccurredAt - Initial value for the "Date" field (defaults to current date)
 * @returns A React element that renders the "New spend" modal and its associated camera/category pickers
 */
export default function NewSpendModal({
  visible,
  onRequestClose,
  authedFetch,
  categories,
  onSaved,
  initialOccurredAt = new Date(),
}: Props) {
  const cameraRef = useRef<CameraView | null>(null)

  const services = useMemo(
    () =>
      [
        // Prefer local PNG assets (consistent across platforms).
        // For services without assets yet (Netflix/Prime/etc), fall back to generic Ionicons.
        { key: "spotify", label: "Spotify", image: icons.spotify },
        { key: "tidal", label: "Tidal", ionicon: "musical-notes-outline" },
        { key: "github", label: "GitHub", image: icons.github },
        { key: "netflix", label: "Netflix", ionicon: "film-outline" },
        { key: "hbo-max", label: "HBO Max", ionicon: "tv-outline" },
        { key: "amazon-prime", label: "Prime", ionicon: "cart-outline" },
        { key: "youtube", label: "YouTube", ionicon: "play-circle-outline" },
        { key: "apple", label: "Apple", ionicon: "phone-portrait-outline" },
        { key: "google", label: "Google", ionicon: "globe-outline" },
      ] as { key: string; label: string; ionicon?: string; image?: any }[],
    [],
  )

  const [savingSpend, setSavingSpend] = useState(false)
  const [datePicker, setDatePicker] = useState<null | { field: "occurredAt" | "renewalAt"; value: Date }>(null)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")

  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [scanningReceipt, setScanningReceipt] = useState(false)
  const [pendingCameraOpen, setPendingCameraOpen] = useState(false)
  const [cameraInlineOpen, setCameraInlineOpen] = useState(false)

  const [spendForm, setSpendForm] = useState({
    title: "",
    amount: "",
    currency: "SEK",
    occurredAt: initialOccurredAt as Date | null,
    renewalAt: null as Date | null,
    categoryId: null as string | null,
    serviceKey: null as string | null,
    notes: "",
  })

  useEffect(() => {
    if (!visible) return
    setSpendForm({
      title: "",
      amount: "",
      currency: "SEK",
      occurredAt: initialOccurredAt,
      renewalAt: null,
      categoryId: null,
      serviceKey: null,
      notes: "",
    })
    setDatePicker(null)
    setCategoryPickerOpen(false)
    setCategorySearch("")
    setCameraModalOpen(false)
    setScanningReceipt(false)
    setPendingCameraOpen(false)
    setCameraInlineOpen(false)
  }, [initialOccurredAt, visible])

  const closeCamera = () => {
    setCameraModalOpen(false)
    setScanningReceipt(false)
    setPendingCameraOpen(false)
    setCameraInlineOpen(false)
  }

  const closeSpend = () => {
    if (savingSpend) return
    setDatePicker(null)
    closeCamera()
    onRequestClose()
  }

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.kind === "expense" || c.kind === "subscription"),
    [categories],
  )

  const selectedCategoryName = useMemo(() => {
    if (!spendForm.categoryId) return "None"
    const c = filteredCategories.find((x) => x._id === spendForm.categoryId)
    return c?.name ?? "Unknown"
  }, [filteredCategories, spendForm.categoryId])

  const filteredCategoryResults = useMemo(() => {
    const q = categorySearch.trim().toLowerCase()
    if (!q) return filteredCategories
    return filteredCategories.filter((c) => c.name.toLowerCase().includes(q))
  }, [categorySearch, filteredCategories])

  const scanReceiptFromUri = async (uri: string) => {
    if (scanningReceipt) return
    setScanningReceipt(true)
    try {
      const img = await manipulateAsync(uri, [{ resize: { width: 1280 } }], {
        compress: 0.65,
        format: SaveFormat.JPEG,
        base64: true,
      })
      if (!img.base64) throw new Error("Failed to encode image")

      const res = await authedFetch("/spends/scan-receipt", {
        method: "POST",
        body: JSON.stringify({ imageBase64: img.base64, mimeType: "image/jpeg" }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Request failed (${res.status})`)
      }
      const json = (await res.json()) as {
        result: { title?: string | null; amount?: number | null; currency?: string | null; occurredAt?: string | null }
      }
      const r = json.result

      setSpendForm((f) => ({
        ...f,
        title: r.title ?? f.title,
        amount: typeof r.amount === "number" ? String(r.amount) : f.amount,
        currency: r.currency ? r.currency : f.currency,
        occurredAt: r.occurredAt
          ? (() => {
              const [year, month, day] = r.occurredAt.split("-").map(Number)
              return new Date(year, month - 1, day)
            })()
          : f.occurredAt,
      }))
      closeCamera()

      if (!r.amount && !r.title && !r.occurredAt) {
        Alert.alert("Couldn't read receipt", "Try taking the photo closer with good lighting.")
      }
    } catch (e) {
      Alert.alert("Receipt scan failed", e instanceof Error ? e.message : "Unknown error")
    } finally {
      setScanningReceipt(false)
    }
  }

  const openCamera = async () => {
    if (scanningReceipt) return
    const granted = cameraPermission?.granted
    if (!granted) {
      const res = await requestCameraPermission()
      if (!res.granted) {
        Alert.alert("Camera permission needed", "Enable camera permission to scan a receipt.")
        return
      }
    }
    // Open camera inside the spend modal (avoids nested modal issues on iOS).
    setCameraInlineOpen(true)
  }

  useEffect(() => {
    if (!pendingCameraOpen) return
    if (!cameraPermission?.granted) return
    // Avoid modal presentation conflicts (pageSheet -> overFullScreen).
    const t = setTimeout(() => {
      setCameraModalOpen(true)
      setPendingCameraOpen(false)
    }, 0)
    return () => clearTimeout(t)
  }, [cameraPermission?.granted, pendingCameraOpen])

  const submitSpend = async () => {
    if (savingSpend) return
    const amountNumber = Number(spendForm.amount)
    if (!spendForm.title.trim()) return
    if (!Number.isFinite(amountNumber) || amountNumber < 0) return

    setSavingSpend(true)
    try {
      const payload: Record<string, unknown> = {
        title: spendForm.title.trim(),
        type: "expense",
        amountCents: Math.round(amountNumber * 100),
        currency: spendForm.currency.trim().toUpperCase(),
        categoryId: spendForm.categoryId,
        serviceKey: spendForm.serviceKey,
        notes: spendForm.notes.trim() ? spendForm.notes.trim() : null,
        occurredAt: spendForm.occurredAt ? dayjs(spendForm.occurredAt).format("YYYY-MM-DD") : undefined,
        renewalAt: spendForm.renewalAt ? dayjs(spendForm.renewalAt).format("YYYY-MM-DD") : undefined,
      }

      const res = await authedFetch("/spends", { method: "POST", body: JSON.stringify(payload) })
      if (res.ok) {
        invalidateApiCache(["/spends", "/summary"])
        await onSaved?.()
        onRequestClose()
      }
    } finally {
      setSavingSpend(false)
    }
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSpend}>
        <Pressable className="flex-1" onPress={() => Keyboard.dismiss()}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className="flex-1 bg-[#F6F7FF] p-5"
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-3">
                <Text className="text-xl font-semibold text-black">New spend</Text>
                <Pressable onPress={openCamera} hitSlop={10} disabled={savingSpend || scanningReceipt}>
                  <View className={savingSpend || scanningReceipt ? "opacity-50" : ""}>
                    <Ionicons name="camera" size={22} color="#111827" />
                  </View>
                </Pressable>
              </View>
              <Pressable onPress={closeSpend} hitSlop={10} disabled={savingSpend}>
                <Text className="text-primary font-semibold">Close</Text>
              </Pressable>
            </View>

            <View className="gap-3">
              <View>
                <Text className="text-sm text-gray-600 mb-1">Service (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  <Pressable
                    onPress={() => setSpendForm((f) => ({ ...f, serviceKey: null }))}
                    className={
                      spendForm.serviceKey === null
                        ? "flex-row items-center gap-2 rounded-full bg-primary px-4 py-2"
                        : "flex-row items-center gap-2 rounded-full bg-gray-100 px-4 py-2"
                    }
                  >
                    <Ionicons name="pricetag-outline" size={16} color={spendForm.serviceKey === null ? "#fff" : "#111827"} />
                    <Text className={spendForm.serviceKey === null ? "text-white font-semibold" : "text-black font-semibold"}>
                      None
                    </Text>
                  </Pressable>

                  {services.map((s) => {
                    const selected = spendForm.serviceKey === s.key
                    return (
                      <Pressable
                        key={s.key}
                        onPress={() =>
                          setSpendForm((f) => ({
                            ...f,
                            serviceKey: s.key,
                            // If title is empty, help by prefilling from selection.
                            title: f.title.trim().length === 0 ? s.label : f.title,
                          }))
                        }
                        className={
                          selected
                            ? "flex-row items-center gap-2 rounded-full bg-primary px-4 py-2"
                            : "flex-row items-center gap-2 rounded-full bg-gray-100 px-4 py-2"
                        }
                      >
                        {s.image ? (
                          <Image source={s.image} style={{ width: 16, height: 16 }} resizeMode="contain" />
                        ) : (
                          <Ionicons name={(s.ionicon || "pricetag-outline") as any} size={16} color={selected ? "#fff" : "#111827"} />
                        )}
                        <Text className={selected ? "text-white font-semibold" : "text-black font-semibold"}>{s.label}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>

              <View>
                <Text className="text-sm text-gray-600 mb-1">Title</Text>
                <TextInput
                  value={spendForm.title}
                  onChangeText={(t) => setSpendForm((f) => ({ ...f, title: t }))}
                  className="rounded-xl bg-white px-4 py-3"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-sm text-gray-600 mb-1">Amount</Text>
                  <TextInput
                    value={spendForm.amount}
                    onChangeText={(t) => setSpendForm((f) => ({ ...f, amount: t }))}
                    keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                    className="rounded-xl bg-white px-4 py-3"
                  />
                </View>
                <View className="w-28">
                  <Text className="text-sm text-gray-600 mb-1">Currency</Text>
                  <TextInput
                    value={spendForm.currency}
                    onChangeText={(t) => setSpendForm((f) => ({ ...f, currency: t }))}
                    autoCapitalize="characters"
                    className="rounded-xl bg-white px-4 py-3"
                  />
                </View>
              </View>

              <View>
                <Text className="text-sm text-gray-600 mb-1">Date (optional)</Text>
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() =>
                      setDatePicker({
                        field: "occurredAt",
                        value: spendForm.occurredAt ?? new Date(),
                      })
                    }
                    className="flex-1 rounded-xl bg-white px-4 py-3"
                  >
                    <Text className="text-black">
                      {spendForm.occurredAt ? dayjs(spendForm.occurredAt).format("YYYY-MM-DD") : "Not set"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSpendForm((f) => ({ ...f, occurredAt: null }))}
                    className="rounded-xl bg-gray-200 px-4 py-3"
                  >
                    <Text className="text-black font-semibold">Clear</Text>
                  </Pressable>
                </View>
              </View>

              <View>
                <Text className="text-sm text-gray-600 mb-1">Renewal date (optional)</Text>
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() =>
                      setDatePicker({
                        field: "renewalAt",
                        value: spendForm.renewalAt ?? new Date(),
                      })
                    }
                    className="flex-1 rounded-xl bg-white px-4 py-3"
                  >
                    <Text className="text-black">
                      {spendForm.renewalAt ? dayjs(spendForm.renewalAt).format("YYYY-MM-DD") : "Not set"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSpendForm((f) => ({ ...f, renewalAt: null }))}
                    className="rounded-xl bg-gray-200 px-4 py-3"
                  >
                    <Text className="text-black font-semibold">Clear</Text>
                  </Pressable>
                </View>
              </View>

              {datePicker && (
                <DateTimePicker
                  value={datePicker.value}
                  mode="date"
                  display="default"
                  onValueChange={(_event, selected) => {
                    if (!selected) return
                    setSpendForm((f) =>
                      datePicker.field === "occurredAt" ? { ...f, occurredAt: selected } : { ...f, renewalAt: selected },
                    )
                    if (Platform.OS !== "ios") setDatePicker(null)
                  }}
                  onDismiss={() => setDatePicker(null)}
                />
              )}

              <View>
                <Text className="text-sm text-gray-600 mb-1">Category</Text>
                <Pressable
                  onPress={() => setCategoryPickerOpen(true)}
                  className="rounded-xl bg-white px-4 py-3 flex-row items-center justify-between"
                >
                  <Text className={spendForm.categoryId ? "text-black font-semibold" : "text-gray-500 font-semibold"}>
                    {selectedCategoryName}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#111827" />
                </Pressable>
              </View>

              <View>
                <Text className="text-sm text-gray-600 mb-1">Notes</Text>
                <TextInput
                  value={spendForm.notes}
                  onChangeText={(t) => setSpendForm((f) => ({ ...f, notes: t }))}
                  multiline
                  className="rounded-xl bg-white px-4 py-3 min-h-[96px]"
                />
              </View>
            </View>

            <View className="mt-6 flex-row gap-3">
              <Pressable onPress={closeSpend} className="flex-1 rounded-xl bg-gray-200 px-4 py-3" disabled={savingSpend}>
                <Text className="text-center font-semibold text-black">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitSpend}
                className={savingSpend ? "flex-1 rounded-xl bg-primary/70 px-4 py-3" : "flex-1 rounded-xl bg-primary px-4 py-3"}
                disabled={savingSpend}
              >
                <View className="flex-row items-center justify-center gap-2">
                  {savingSpend && <ActivityIndicator color="#fff" />}
                  <Text className="text-center font-semibold text-white">{savingSpend ? "Saving..." : "Save"}</Text>
                </View>
              </Pressable>
            </View>

            {categoryPickerOpen && (
              <View className="absolute inset-0">
                <Pressable
                  className="absolute inset-0 bg-black/30"
                  onPress={() => {
                    setCategoryPickerOpen(false)
                    setCategorySearch("")
                  }}
                />

                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                  className="absolute left-0 right-0 bottom-0 rounded-t-3xl bg-[#F6F7FF] p-5"
                >
                  <View className="flex-row items-center justify-between mb-4">
                    <Text className="text-lg font-semibold text-black">Select category</Text>
                    <Pressable
                      onPress={() => {
                        setCategoryPickerOpen(false)
                        setCategorySearch("")
                      }}
                      hitSlop={10}
                    >
                      <Text className="text-primary font-semibold">Done</Text>
                    </Pressable>
                  </View>

                  <View className="mb-3">
                    <TextInput
                      value={categorySearch}
                      onChangeText={setCategorySearch}
                      placeholder="Search categories…"
                      className="rounded-xl bg-white px-4 py-3"
                      autoCapitalize="none"
                      autoCorrect={false}
                      clearButtonMode="while-editing"
                      autoFocus
                    />
                  </View>

                  <FlatList
                    data={[{ _id: "__none__", name: "None", kind: "expense" as const }, ...filteredCategoryResults]}
                    keyExtractor={(item) => item._id}
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: 360 }}
                    ItemSeparatorComponent={() => <View className="h-2" />}
                    renderItem={({ item }) => {
                      const isNone = item._id === "__none__"
                      const selected = isNone ? spendForm.categoryId === null : spendForm.categoryId === item._id
                      return (
                        <Pressable
                          onPress={() => {
                            setSpendForm((f) => ({ ...f, categoryId: isNone ? null : item._id }))
                            setCategoryPickerOpen(false)
                            setCategorySearch("")
                          }}
                          className={selected ? "rounded-xl bg-primary px-4 py-3" : "rounded-xl bg-white px-4 py-3"}
                        >
                          <Text className={selected ? "text-white font-semibold" : "text-black font-semibold"}>
                            {item.name}
                          </Text>
                        </Pressable>
                      )
                    }}
                    ListEmptyComponent={
                      <View className="py-8">
                        <Text className="text-center text-sm text-gray-500">No categories match your search.</Text>
                      </View>
                    }
                  />
                </KeyboardAvoidingView>
              </View>
            )}

            {cameraInlineOpen && (
              <View className="absolute inset-0 bg-black">
                {cameraPermission?.granted ? (
                  <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
                ) : (
                  <View className="flex-1 items-center justify-center px-6">
                    <Text className="text-white text-base text-center">Camera permission is required.</Text>
                    <Pressable
                      onPress={async () => {
                        const res = await requestCameraPermission()
                        if (res.granted) setCameraInlineOpen(true)
                      }}
                      className="mt-4 rounded-xl bg-white px-4 py-3"
                    >
                      <Text className="text-black font-semibold">Grant permission</Text>
                    </Pressable>
                  </View>
                )}

                <View className="absolute bottom-0 left-0 right-0 p-5">
                  <View className="flex-row items-center justify-between">
                    <Pressable
                      onPress={() => setCameraInlineOpen(false)}
                      disabled={scanningReceipt}
                      className={scanningReceipt ? "rounded-xl bg-white/20 px-4 py-3" : "rounded-xl bg-white/30 px-4 py-3"}
                    >
                      <Text className="text-white font-semibold">Cancel</Text>
                    </Pressable>

                    <Pressable
                      onPress={async () => {
                        if (scanningReceipt) return
                        if (!cameraPermission?.granted) return
                        const pic = await cameraRef.current?.takePictureAsync?.({ quality: 0.75, skipProcessing: true })
                        if (!pic?.uri) return
                        await scanReceiptFromUri(pic.uri)
                        setCameraInlineOpen(false)
                      }}
                      disabled={scanningReceipt}
                      className={scanningReceipt ? "rounded-full bg-white/40 px-6 py-4" : "rounded-full bg-white px-6 py-4"}
                    >
                      <View className="flex-row items-center justify-center gap-2">
                        {scanningReceipt && <ActivityIndicator color="#111827" />}
                        <Text className="text-black font-semibold">{scanningReceipt ? "Scanning…" : "Capture"}</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={cameraModalOpen}
        animationType="fade"
        presentationStyle={Platform.OS === "ios" ? "overFullScreen" : "fullScreen"}
        statusBarTranslucent
        onRequestClose={() => (scanningReceipt ? null : closeCamera())}
      >
        <View className="flex-1 bg-black">
          {cameraPermission?.granted ? (
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          ) : (
            <View className="flex-1 items-center justify-center px-6">
              <Text className="text-white text-base text-center">Camera permission is required.</Text>
              <Pressable
                onPress={async () => {
                  const res = await requestCameraPermission()
                  if (res.granted) setPendingCameraOpen(true)
                }}
                className="mt-4 rounded-xl bg-white px-4 py-3"
              >
                <Text className="text-black font-semibold">Grant permission</Text>
              </Pressable>
            </View>
          )}

          <View className="absolute bottom-0 left-0 right-0 p-5">
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={closeCamera}
                disabled={scanningReceipt}
                className={scanningReceipt ? "rounded-xl bg-white/20 px-4 py-3" : "rounded-xl bg-white/30 px-4 py-3"}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (scanningReceipt) return
                  if (!cameraPermission?.granted) return
                  const pic = await cameraRef.current?.takePictureAsync?.({ quality: 0.75, skipProcessing: true })
                  if (!pic?.uri) return
                  await scanReceiptFromUri(pic.uri)
                }}
                disabled={scanningReceipt}
                className={scanningReceipt ? "rounded-full bg-white/40 px-6 py-4" : "rounded-full bg-white px-6 py-4"}
              >
                <View className="flex-row items-center justify-center gap-2">
                  {scanningReceipt && <ActivityIndicator color="#111827" />}
                  <Text className="text-black font-semibold">{scanningReceipt ? "Scanning…" : "Capture"}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

