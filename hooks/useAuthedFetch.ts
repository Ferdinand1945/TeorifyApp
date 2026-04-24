import { useAuth } from '@clerk/expo'
import { useCallback, useEffect, useRef } from 'react'

import { getApiBaseUrl } from '@/lib/api'

type CachedResponse = {
  expiresAt: number
  status: number
  statusText: string
  headers: Record<string, string>
  bodyText: string
}

const getCache = new Map<string, CachedResponse>()

export function invalidateApiCache(prefixes: string[] = []) {
  if (prefixes.length === 0) {
    getCache.clear()
    return
  }
  for (const key of getCache.keys()) {
    if (prefixes.some((p) => key.includes(p))) getCache.delete(key)
  }
}

function shouldCacheGet(url: string, init: RequestInit) {
  const method = (init.method || 'GET').toUpperCase()
  if (method !== 'GET') return false
  // Cache only our JSON API calls.
  return (
    url.includes('/subscriptions') ||
    url.includes('/categories') ||
    url.includes('/spends') ||
    url.includes('/summary')
  )
}

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
  const getTokenRef = useRef(getToken)
  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const url = `${getApiBaseUrl()}${path}`

      // Fast path: serve from short-lived in-memory cache.
      if (shouldCacheGet(url, init)) {
        const cached = getCache.get(url)
        if (cached && Date.now() < cached.expiresAt) {
          return new Response(cached.bodyText, {
            status: cached.status,
            statusText: cached.statusText,
            headers: { ...cached.headers, 'X-Cache': 'HIT' },
          })
        }
      }

      const headers = new Headers(init.headers)

      const body = init.body as unknown
      const isFormData =
        typeof FormData !== 'undefined' && typeof body === 'object' && body != null && body instanceof FormData
      const isBlob = typeof Blob !== 'undefined' && typeof body === 'object' && body != null && body instanceof Blob
      const isArrayBuffer =
        typeof ArrayBuffer !== 'undefined' && typeof body === 'object' && body != null && body instanceof ArrayBuffer

      const isJsonishBody =
        body == null ||
        typeof body === 'string' ||
        (typeof body === 'object' && !isFormData && !isBlob && !isArrayBuffer)

      if (!headers.has('Content-Type') && isJsonishBody) {
        headers.set('Content-Type', 'application/json')
      }

      // Token fetch can be a major latency source; use cached token by default.
      // If the request comes back 401, retry once with skipCache to refresh.
      const token = await getTokenRef.current()
      if (token) headers.set('Authorization', `Bearer ${token}`)

      // Make networking failures obvious during development.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.log('[api]', init.method ?? 'GET', url)
      }

      const controller = new AbortController()
      const timeoutMs = typeof __DEV__ !== 'undefined' && __DEV__ ? 15_000 : 30_000
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        let res = await fetch(url, {
          ...init,
          headers,
          signal: init.signal ?? controller.signal,
        })

        if (res.status === 401) {
          const fresh = await getTokenRef.current({ skipCache: true })
          if (fresh) {
            headers.set('Authorization', `Bearer ${fresh}`)
            res = await fetch(url, {
              ...init,
              headers,
              signal: init.signal ?? controller.signal,
            })
          }
        }

        // Store successful JSON GET responses briefly to improve perceived performance.
        if (shouldCacheGet(url, init) && res.ok) {
          const ttlMs = 15_000
          const clone = res.clone()
          const bodyText = await clone.text()
          const headersObj: Record<string, string> = {}
          clone.headers.forEach((value, key) => {
            headersObj[key] = value
          })
          getCache.set(url, {
            expiresAt: Date.now() + ttlMs,
            status: res.status,
            statusText: res.statusText,
            headers: headersObj,
            bodyText,
          })
        }

        return res
      } finally {
        clearTimeout(timeout)
      }
    },
    [],
  )
}

