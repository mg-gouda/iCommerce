import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { money, parse, qty } from "../../../../../lib/parse"
import { getTiers, setTiers } from "../../../../../lib/wholesale"
import { getCaller } from "../../../helpers"
import { vendorProductIds } from "../../helpers"

const Tiers = z
  .object({ tiers: z.array(z.object({ min_qty: qty, unit_price_usd: money }).strict()).max(10) })
  .strict()
  .refine((b) => b.tiers.every((t, i) => i === 0 || t.min_qty > b.tiers[i - 1].min_qty), "min_qty must be strictly ascending")
  .refine((b) => b.tiers.every((t, i) => i === 0 || t.unit_price_usd <= b.tiers[i - 1].unit_price_usd), "unit_price_usd must not increase with min_qty")

async function ownedOr404(req: AuthenticatedMedusaRequest) {
  const { vendor } = await getCaller(req)
  const [owned] = await vendorProductIds(req.scope, vendor.id, req.params.id)
  if (!owned) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id "${req.params.id}" not found`)
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await ownedOr404(req)
  res.json({ tiers: await getTiers(req.scope, req.params.id) })
}

// Replaces all tiers (same tiers on every variant). [] clears.
export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { tiers } = parse(Tiers, req.body)
  await ownedOr404(req)
  await setTiers(req.scope, req.params.id, tiers)
  res.json({ tiers: await getTiers(req.scope, req.params.id) })
}
