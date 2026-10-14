import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { feeSvc } from "../../../../lib/fees"
import { parse } from "../../../../lib/parse"
import { checkTier, FeeTierBody, shapeTier } from "../helpers"

// Edits never touch placed orders: each order line carries its own fee snapshot.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(FeeTierBody.partial(), req.body)
  const svc = feeSvc(req.scope)
  checkTier({ ...(await svc.retrieveFeeTier(req.params.id)), ...body })
  res.json({ fee_tier: shapeTier(await svc.updateFeeTiers({ id: req.params.id, ...body })) })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = feeSvc(req.scope)
  await svc.retrieveFeeTier(req.params.id)
  await svc.deleteFeeTiers(req.params.id)
  res.json({ id: req.params.id, object: "fee_tier", deleted: true })
}
