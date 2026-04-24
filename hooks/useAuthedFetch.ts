import { useAuth } from '@clerk/expo'

import { getApiBaseUrl } from '@/lib/api'

/**
 * React hook that provides a fetch wrapper which prefixes requests with the API base URL,
 * sets `Content-Type: application/json`, preserves caller headers, and includes an
 * `Authorization: Bearer <token>` header when an auth token is available.
 *
 * @returns A function `(path: string, init?: RequestInit) => Promise<Response>` that performs a `fetch` to the API base URL plus `path`. The request:
 * - sets the `Content-Type` to `application/json`
 * - merges any headers from `init.headers`
 * - includes `Authorization: Bearer <token>` when a token is present
 */
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

