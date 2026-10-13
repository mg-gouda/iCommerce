import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { isB2bVerified } from "../../../../../lib/company"
import { getTiers } from "../../../../../lib/wholesale"

// Tier table for verified company members only; everyone else learns it's gated.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!(await isB2bVerified(req.scope, req.auth_context?.actor_id))) return res.json({ tiers: null, gated: true })
  res.json({ tiers: await getTiers(req.scope, req.params.id), gated: false })
}
