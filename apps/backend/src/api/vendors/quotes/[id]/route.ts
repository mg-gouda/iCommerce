import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getQuoteOr404, shapeQuotes, transition } from "../../../../lib/quotes"
import { getCaller } from "../../helpers"

// First open by the vendor marks the RFQ as seen: requested → vendor_review.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  let q = await getQuoteOr404(req.scope, req.params.id, { vendor_id: vendor.id })
  if (q.status === "requested") {
    await transition(req.scope, q, { status: "vendor_review" }, "viewed")
    q = await getQuoteOr404(req.scope, req.params.id, { vendor_id: vendor.id })
  }
  res.json({ quote: (await shapeQuotes(req.scope, [q], true))[0] })
}
