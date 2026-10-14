import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getQuoteOr404, shapeQuotes } from "../../../../lib/quotes"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const q = await getQuoteOr404(req.scope, req.params.id, {})
  res.json({ quote: (await shapeQuotes(req.scope, [q], true))[0] })
}
