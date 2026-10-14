import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { feeSvc } from "../../../lib/fees"
import { parse } from "../../../lib/parse"
import { checkTier, FeeTierBody, shapeTier } from "./helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const channel = req.query.channel as "b2b" | "b2c" | undefined
  const tiers = await feeSvc(req.scope).listFeeTiers(channel ? { channel } : {})
  tiers.sort((a, b) => a.channel.localeCompare(b.channel) || Number(a.min_amount) - Number(b.min_amount))
  res.json({ fee_tiers: tiers.map(shapeTier) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(FeeTierBody, req.body)
  checkTier(body)
  const tier = await feeSvc(req.scope).createFeeTiers(body)
  res.status(201).json({ fee_tier: shapeTier(tier) })
}
