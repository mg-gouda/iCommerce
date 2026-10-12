import { getTiers } from "./api"

/**
 * Wholesale price range (lowest–highest tier) per product id, for grids.
 * ponytail: one tiers call per tile (≤48); a batch endpoint if grids grow.
 */
export async function wholesaleRanges(ids: string[]) {
  const all = await Promise.all(ids.map(async (id) => [id, await getTiers(id).catch(() => null)] as const))
  return new Map(
    all.flatMap(([id, t]) => (t?.length ? [[id, { min: t[t.length - 1].unit_price_usd, max: t[0].unit_price_usd }] as const] : []))
  )
}
