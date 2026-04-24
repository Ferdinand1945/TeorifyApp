export function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')
}

