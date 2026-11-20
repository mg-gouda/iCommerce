import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { breakdownHandler } from "../../../../lib/reports"
import { getCaller } from "../../helpers"

// GET /vendors/reports/breakdown — scoped to the caller's vendor.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  await breakdownHandler(req.scope, res, req.query, vendor.id)
}
