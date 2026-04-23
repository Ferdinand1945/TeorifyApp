import { useAuth } from '@clerk/expo'
import { Redirect, Stack } from 'expo-router'

/**
 * Layout component that gates navigation based on Clerk authentication state.
 *
 * Renders nothing while the authentication state is loading, redirects signed-in users to the `/(tabs)` route, and renders the authentication `Stack` when the user is signed out.
 *
 * @returns A React element: `null` while auth is loading, a `<Redirect>` to `/(tabs)` when signed in, or a `<Stack>` for unauthenticated routes when signed out.
 */
export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth()

  if (!isLoaded) {
    return null
  }

  if (isSignedIn) {
    return <Redirect href={'/(tabs)'} />
  }

  return <Stack />
}