import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type User = { id: number; email: string; name: string; role: 'biller' | 'manager' }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const type = res.headers.get('content-type') ?? ''
  const data = type.includes('json') ? await res.json() : await res.text()
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('cl:signed-out'))
    throw new ApiError((data as { error?: string })?.error ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}

/** Fetch on mount / when deps change; `reload()` refetches. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!path })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let live = true
    set((s) => ({ ...s, loading: true, error: undefined }))
    api<T>(path).then(
      (data) => live && set({ data, loading: false }),
      (e) => live && set({ error: (e as Error).message, loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

export const AuthContext = createContext<{ user: User | null; setUser: (u: User | null) => void }>({ user: null, setUser: () => {} })
export const useAuth = () => useContext(AuthContext)

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
export const money0 = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const shortDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const initials = (name?: string | null) => (name ?? '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export function download(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
