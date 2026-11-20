import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { summaryHandler } from "../../../../lib/reports"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await summaryHandler(req.scope, res, req.query, null)
}
