import { useCallback, useEffect, useState } from "react"

// ponytail: plain fetch on the admin session cookie (same origin) instead of the JS SDK + react-query.
export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
  return data as T
}

/** GET `path` (re-runs when it changes) + reload(). */
export function useGet<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    api<T>(path).then(setData, (e) => setError(e.message))
  }, [path])
  useEffect(reload, [reload])
  return { data, error, reload }
}

/** Runs a mutation, reloads, surfaces the error via alert (admin-only, tiny UI). */
export const act = (fn: () => Promise<unknown>, reload: () => void) => () =>
  fn().then(reload, (e: Error) => window.alert(e.message))

export const selectCls = "bg-ui-bg-field border border-ui-border-base rounded-md px-2 py-1 txt-compact-small"
