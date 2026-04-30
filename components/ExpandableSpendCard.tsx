import { formatCurrency } from "@/lib/utils"
import dayjs from "dayjs"
import React from "react"
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"

type SpendLike = {
  title: string
  type: "expense" | "income"
  amountCents: number
  currency: string
  occurredAt: string
  renewalAt?: string | null
  categoryLabel: string
  serviceKeyLabel?: string | null
  notes?: string | null
}

type Props = {
  spend: SpendLike
  icon: any
  iconBg?: string
  expanded: boolean
  onToggle: () => void
  onDeletePress?: () => void
  isDeleting?: boolean
}

export default function ExpandableSpendCard({
  spend,
  icon,
  iconBg = "#E7E5E4",
  expanded,
  onToggle,
  onDeletePress,
  isDeleting,
}: Props) {
  const freq = spend.renewalAt ? "Recurring" : "One-time"
  const subtitle = `${spend.categoryLabel} • ${freq}`

  return (
    <View
      className="rounded-3xl bg-white overflow-hidden"
      style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
    >
      <Pressable onPress={onToggle} className="px-4 py-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 min-w-0 flex-1">
          <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: iconBg }}>
            <Image source={icon} style={{ width: 22, height: 22 }} resizeMode="contain" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-base font-sans-extrabold text-black" numberOfLines={1}>
              {spend.title}
            </Text>
            <Text className="text-xs font-sans-semibold text-gray-500" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View className="items-end ml-2 flex-row gap-2">
          <View className="items-end">
            <Text className="text-base font-sans-extrabold text-black">
              {formatCurrency(spend.amountCents / 100, spend.currency)}
            </Text>
            <Text className="text-xs font-sans-semibold text-gray-500">{freq}</Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#6B7280" />
        </View>
      </Pressable>

      {expanded && (
        <View className="border-t border-gray-100 px-4 pb-4 pt-2">
          <View className="gap-2">
            <Row label="Type" value={spend.type === "income" ? "Income" : "Expense"} />
            <Row label="Date" value={dayjs(spend.occurredAt).format("MMM D, YYYY")} />
            {spend.renewalAt ? <Row label="Renewal" value={dayjs(spend.renewalAt).format("MMM D, YYYY")} /> : null}
            {spend.serviceKeyLabel ? <Row label="Service" value={spend.serviceKeyLabel} /> : null}
            {spend.notes ? <Row label="Notes" value={spend.notes} multiline /> : null}
          </View>

          {onDeletePress && (
            <Pressable
              onPress={onDeletePress}
              disabled={isDeleting}
              className={isDeleting ? "mt-4 rounded-2xl bg-destructive/60 px-4 py-3" : "mt-4 rounded-2xl bg-destructive px-4 py-3"}
            >
              <View className="flex-row items-center justify-center gap-2">
                {isDeleting && <ActivityIndicator color="#fff" size="small" />}
                <Text className="text-center text-sm font-sans-extrabold text-white">
                  {isDeleting ? "Deleting…" : "Delete"}
                </Text>
              </View>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text className="shrink-0 text-sm font-sans-semibold text-gray-500">{label}</Text>
      <Text
        className="flex-1 text-right text-sm font-sans-extrabold text-black"
        numberOfLines={multiline ? undefined : 2}
      >
        {value}
      </Text>
    </View>
  )
}
