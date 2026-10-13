import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { isB2bVerified } from "../../../../lib/company"
import { getTiersMany } from "../../../../lib/wholesale"

// GET /store/products/wholesale-tiers?ids=a,b,c (≤50) — batch for product grids; same gating as the single route.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const ids = [...new Set(String(req.query.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean))]
  if (!ids.length || ids.length > 50) throw new MedusaError(MedusaError.Types.INVALID_DATA, "ids: 1–50 comma-separated product ids")
  if (!(await isB2bVerified(req.scope, req.auth_context?.actor_id))) return res.json({ tiers: null, gated: true })
  res.json({ tiers: await getTiersMany(req.scope, ids), gated: false })
}
