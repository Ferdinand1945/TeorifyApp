import { useAuth } from '@clerk/expo'

import { getApiBaseUrl } from '@/lib/api'

export function useAuthedFetch() {
  const { getToken } = useAuth()

  return async (path: string, init: RequestInit = {}) => {
    // `skipCache` helps avoid rare cases where a fresh token is needed.
    const token = await getToken({ skipCache: true })
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    return res
  }
}

