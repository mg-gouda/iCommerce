import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getVendorOrderOr404 } from "../../../../lib/vendor-orders"
import { getCaller } from "../../helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  res.json({ order: await getVendorOrderOr404(req.scope, vendor.id, req.params.id) })
}
