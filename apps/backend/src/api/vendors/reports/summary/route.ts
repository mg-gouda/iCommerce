import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { summaryHandler } from "../../../../lib/reports"
import { getCaller } from "../../helpers"

// GET /vendors/reports/summary — scoped to the caller's vendor.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  await summaryHandler(req.scope, res, req.query, vendor.id)
}
