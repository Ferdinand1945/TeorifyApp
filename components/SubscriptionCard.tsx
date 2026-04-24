import { formatCurrency, formatStatusLabel, formatSubscriptionDateTime } from '@/lib/utils'
import clsx from 'clsx'
import React from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'

const SubscriptionCard = ({
  name,
  price,
  category,
  plan,
  currency,
  icon,
  billing,
  renewalDate,
  paymentMethod,
  color,
  expanded,
  startDate,
  status,
  onPress,
  onEditPress,
  onDeletePress,
  isDeleting,
}: SubscriptionCardProps) => {
  return (
    <Pressable onPress={onPress} className={clsx('sub-card', 'bg-card', expanded && 'sub-card-expanded')} style={!expanded && color ? { backgroundColor: color } : undefined}>
      <View className='sub-head'>
        <View className='sub-main'>
        <Image source={icon} className='sub-icon' />
        <View className='sub-copy'>
            <Text numberOfLines={1} className='sub-title'>{name}</Text>
            <Text numberOfLines={1} className='sub-meta' ellipsizeMode='tail'>{category?.trim() || plan?.trim() || (renewalDate ? formatSubscriptionDateTime(renewalDate) : '')} </Text>
        </View>
        </View>
        <View className='sub-price-box'>
          <Text numberOfLines={1} className='sub-price'>{formatCurrency(price, currency)}</Text>
          <Text numberOfLines={1} className='sub-billing'>{billing}</Text>
        </View>
      </View>
      {expanded && (
        <View className='sub-body'> 
        <View className='sub-details'>
        <View className='sub-row'>
            <View className='sub-row-copy'>
                <Text className='sub-label'>Payment Method:</Text>
                <Text className='sub-value' numberOfLines={1} ellipsizeMode='tail'>{paymentMethod?.trim() || 'Not provided'}</Text>
            </View>
        </View>
        <View className='sub-row'>
            <View className='sub-row-copy'>
                <Text className='sub-label'>Category:</Text>
                <Text className='sub-value' numberOfLines={1} ellipsizeMode='tail'>{category}</Text>
            </View>
        </View>
        <View className='sub-row'>
            <View className='sub-row-copy'>
                <Text className='sub-label'>Started:</Text>
                <Text className='sub-value' numberOfLines={1} ellipsizeMode='tail'>{startDate ? formatSubscriptionDateTime(startDate) : 'Not provided'}</Text>
            </View>
        </View>
        <View className='sub-row'>
            <View className='sub-row-copy'>
                <Text className='sub-label'>Renewal date:</Text>
                <Text className='sub-value' numberOfLines={1} ellipsizeMode='tail'>{renewalDate ? formatSubscriptionDateTime(renewalDate) : 'Not provided'}</Text>
            </View>
        </View>
        <View className='sub-row'>
            <View className='sub-row-copy'>
                <Text className='sub-label'>Status:</Text>
                <Text className='sub-value' numberOfLines={1} ellipsizeMode='tail'>{status ? formatStatusLabel(status) : 'Not provided'}</Text>
            </View>
        </View>
        </View>

        {(onEditPress || onDeletePress) && (
          <View className="flex-row gap-3 mt-4">
            {onEditPress && (
              <Pressable
                onPress={(e) => {
                  // Some RN environments don't support stopPropagation.
                  // Guard to avoid breaking the handler.
                  e?.stopPropagation?.()
                  onEditPress()
                }}
                className="flex-1 rounded-xl bg-background/90 px-4 py-3 border border-border"
              >
                <Text className="text-center text-primary font-semibold">Edit</Text>
              </Pressable>
            )}
            {onDeletePress && (
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.()
                  onDeletePress()
                }}
                disabled={Boolean(isDeleting)}
                className={Boolean(isDeleting) ? "flex-1 rounded-xl bg-destructive/70 px-4 py-3" : "flex-1 rounded-xl bg-destructive px-4 py-3"}
              >
                <View className="flex-row items-center justify-center gap-2">
                  {isDeleting && <ActivityIndicator color="#fff" />}
                  <Text className="text-center text-white font-semibold">{isDeleting ? "Deleting…" : "Delete"}</Text>
                </View>
              </Pressable>
            )}
          </View>
        )}
        </View>
      )}
    </Pressable>
  )
}

export default SubscriptionCard