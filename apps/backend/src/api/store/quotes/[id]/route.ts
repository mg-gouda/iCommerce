import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { callerMembership } from "../../../../lib/company"
import { getQuoteOr404, shapeQuotes } from "../../../../lib/quotes"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { company } = await callerMembership(req)
  const q = await getQuoteOr404(req.scope, req.params.id, { company_id: company.id })
  res.json({ quote: (await shapeQuotes(req.scope, [q], true))[0] })
}
