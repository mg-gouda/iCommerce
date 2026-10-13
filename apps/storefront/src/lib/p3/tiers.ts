import type { Tier } from "./types"

// Pure tier math (client-safe).

/** Unit price for a quantity: the highest tier whose min_qty ≤ qty, else the base price (contract §2). */
export function tierPrice(tiers: Tier[], qty: number, base: number | null) {
  return [...tiers].reverse().find((t) => qty >= t.min_qty)?.unit_price_usd ?? base
}

/** PriceTiers rows ("200–499", "500+") from ascending tiers. ponytail: integer bands (cart qty is integer). */
export const tierRows = (tiers: Tier[]) =>
  tiers.map((t, i) => ({ min: t.min_qty, max: tiers[i + 1] ? tiers[i + 1].min_qty - 1 : undefined, price: t.unit_price_usd }))
