import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { parse } from "../../../../../lib/parse"
import { closeRouting, getQuoteOr404, routeQuote, shapeQuotes } from "../../../../../lib/quotes"

const Route = z.object({ vendor_ids: z.array(z.string()).min(1).max(20) }).strict()
const Close = z.object({ note: z.string().trim().min(1).max(2000) }).strict()

// POST /admin/quotes/:id/{route|close} — staff handling of `find_suppliers` RFQ lines (status `routing`).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { action, id } = req.params
  if (action !== "route" && action !== "close") throw new MedusaError(MedusaError.Types.NOT_FOUND, `Unknown action "${action}"`)
  const body = action === "route" ? parse(Route, req.body) : parse(Close, req.body)
  await getQuoteOr404(req.scope, id, {})
  // Same lock as buyer/vendor actions: a double-click can't route twice.
  await req.scope.resolve(Modules.LOCKING).execute(
    `quote-${id}`,
    async () => {
      const q = await getQuoteOr404(req.scope, id, {})
      if ("vendor_ids" in body) await routeQuote(req.scope, q, body.vendor_ids)
      else await closeRouting(req.scope, q, body.note)
    },
    { timeout: 30 },
  )
  const q = await getQuoteOr404(req.scope, id, {})
  res.json({ quote: (await shapeQuotes(req.scope, [q], true))[0] })
}
