import React, { useMemo } from "react"
import { View } from "react-native"
import Svg, { Circle, G } from "react-native-svg"

export type DonutSlice = {
  value: number
  color: string
}

type Props = {
  size: number
  thickness: number
  slices: DonutSlice[]
  trackColor?: string
}

export default function DonutChart({ size, thickness, slices, trackColor = "#E5E7EB" }: Props) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  const normalized = useMemo(() => {
    const total = slices.reduce((sum, s) => sum + (Number.isFinite(s.value) ? Math.max(0, s.value) : 0), 0)
    if (total <= 0) return []
    return slices
      .map((s) => ({ color: s.color, value: Math.max(0, s.value) / total }))
      .filter((s) => s.value > 0)
  }, [slices])

  let offset = 0

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={thickness}
            fill="transparent"
          />
          {normalized.map((s, idx) => {
            const dash = circumference * s.value
            const gap = circumference - dash
            const circle = (
              <Circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                fill="transparent"
              />
            )
            offset += dash
            return circle
          })}
        </G>
      </Svg>
    </View>
  )
}

