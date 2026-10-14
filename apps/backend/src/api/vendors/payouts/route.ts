import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { payoutSvc, shapeBatches, vendorSummary } from "../../../lib/ledger"
import { getCaller } from "../helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  const batches = await payoutSvc(req.scope).listPayoutBatches({ vendor_id: vendor.id }, { order: { created_at: "DESC" }, take: 50 })
  res.json({ summary: await vendorSummary(req.scope, vendor.id), batches: await shapeBatches(req.scope, batches) })
}
