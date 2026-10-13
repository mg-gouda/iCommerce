import { getTiersBatch } from "./api"

/** Wholesale price range (lowest–highest tier) per product id, for grids. Products without tiers are absent. */
export async function wholesaleRanges(ids: string[]) {
  const ranges = new Map<string, { min: number; max: number }>()
  if (!ids.length) return ranges
  for (const [id, t] of await getTiersBatch(ids)) if (t.length) ranges.set(id, { min: t[t.length - 1].unit_price_usd, max: t[0].unit_price_usd })
  return ranges
}
