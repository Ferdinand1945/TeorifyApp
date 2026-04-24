import { useAuth } from '@clerk/expo'
import { useCallback } from 'react'

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

  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      // `skipCache` helps avoid rare cases where a fresh token is needed.
      const token = await getToken({ skipCache: true })
      const headers = new Headers(init.headers)

      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }

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

      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers,
      })

      return res
    },
    [getToken],
  )
}

