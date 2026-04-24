/**
 * Get the normalized API base URL used by the app.
 *
 * @returns The API base URL: `process.env.EXPO_PUBLIC_API_URL` if set, otherwise `http://localhost:4000`. A single trailing slash, if present, is removed.
 */
export function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')
}

