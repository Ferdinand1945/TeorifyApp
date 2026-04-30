import React from "react"
import { Image, Pressable, Text, View } from "react-native"

type Props = {
  title: string
  subtitle: string
  amountLabel: string
  rightMeta?: string
  icon: any
  iconBg?: string
  onPress?: () => void
}

export default function SpendRowCard({ title, subtitle, amountLabel, rightMeta, icon, iconBg = "#E7E5E4", onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="rounded-3xl bg-white px-4 py-4 flex-row items-center justify-between"
      style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: iconBg }}>
          <Image source={icon} style={{ width: 22, height: 22 }} resizeMode="contain" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-sans-extrabold text-black" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-xs font-sans-semibold text-gray-500" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      <View className="items-end ml-3">
        <Text className="text-base font-sans-extrabold text-black">{amountLabel}</Text>
        {rightMeta ? <Text className="text-xs font-sans-semibold text-gray-500">{rightMeta}</Text> : null}
      </View>
    </Pressable>
  )
}

