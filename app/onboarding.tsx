import { Link } from 'expo-router'
import React from 'react'
import { Text, View } from 'react-native'

const onboarding = () => {
  return (
    <View>
      <Text>onboarding</Text>
      <Link href="/sign-in">Sign In</Link>
    </View>
  )
}

export default onboarding