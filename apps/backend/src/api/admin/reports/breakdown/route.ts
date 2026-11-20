import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { breakdownHandler } from "../../../../lib/reports"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await breakdownHandler(req.scope, res, req.query, null)
}
