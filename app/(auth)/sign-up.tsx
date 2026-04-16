import { Link } from 'expo-router'
import React from 'react'
import { Text, View } from 'react-native'

const signUp = () => {
  return (
    <View>
      <Text>signUp</Text>
      <Link href="/(auth)/sign-in">Sign In</Link>
    </View>
  )
}

export default signUp