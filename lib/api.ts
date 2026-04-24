/**
 * Get the normalized API base URL used by the app.
 *
 * @returns The API base URL with a normalized trailing slash.
 */
import { Platform } from 'react-native'

export function getApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')

  // Dev-only fallback: pick a sensible default for local development.
  // - Android emulators cannot reach the host machine via localhost.
  // - iOS simulator can use localhost.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000'
    // eslint-disable-next-line no-console
    console.warn(
      `[api] EXPO_PUBLIC_API_URL is not set; falling back to ${fallback}. ` +
        `For physical devices, set EXPO_PUBLIC_API_URL to your computer's LAN IP (e.g. http://192.168.x.x:4000).`,
    )
    return fallback
  }

  throw new Error('Missing EXPO_PUBLIC_API_URL. Set it in .env for production builds.')
}

