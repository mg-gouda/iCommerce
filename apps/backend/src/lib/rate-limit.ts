import type { MedusaRequest } from "@medusajs/framework/http"

// ponytail: in-memory fixed window, per process (resets on restart, not shared across instances). Move to a Redis
// INCR + EXPIRE counter once the backend runs more than one instance.
const hits = new Map<string, { n: number; reset: number }>()
const WINDOW = 60 * 60 * 1000
const MAX = 10

/** Rate-limit key for a guest order lookup: the caller's IP.
 *  No per-order-number key on purpose: order numbers are sequential, so a per-order cap would let anyone lock real
 *  buyers out of tracking/receipt upload by guessing wrong emails. Guessing the exact email is the real barrier. */
export function guestKeys(req: MedusaRequest, _display_id?: unknown) { // eslint-disable-line @typescript-eslint/no-unused-vars
  // ponytail: first X-Forwarded-For hop (the storefront forwards the shopper's IP) is trusted as-is; the edge proxy must overwrite it.
  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.ip || "?"
  return [`ip:${ip}`]
}

/** True when any key used up its `MAX` attempts in the current hour. */
export function limited(keys: string[]) {
  const now = Date.now()
  return keys.some((k) => {
    const h = hits.get(k)
    return !!h && h.reset > now && h.n >= MAX
  })
}

export function hit(keys: string[]) {
  const now = Date.now()
  if (hits.size > 10_000) for (const [k, h] of hits) if (h.reset <= now) hits.delete(k)
  for (const k of keys) {
    const h = hits.get(k)
    if (h && h.reset > now) h.n++
    else hits.set(k, { n: 1, reset: now + WINDOW })
  }
}
