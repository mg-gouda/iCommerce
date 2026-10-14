import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { listQuery, parse } from "../../../lib/parse"
import { quoteSvc, shapeQuotes } from "../../../lib/quotes"
import { QUOTE_STATUSES } from "../../../modules/quote/models/quote"

const List = z.object({ status: z.enum(QUOTE_STATUSES).optional(), rfq_id: z.string().optional(), ...listQuery })

// "RFQs to route" = ?status=routing (oldest first so nothing waits forever).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { status, rfq_id, limit, offset } = parse(List, req.query)
  const [quotes, count] = await quoteSvc(req.scope).listAndCountQuotes(
    { ...(status && { status }), ...(rfq_id && { rfq_id }) },
    { relations: ["items"], order: { created_at: status === "routing" ? "ASC" : "DESC" }, skip: offset, take: limit },
  )
  res.json({ quotes: await shapeQuotes(req.scope, quotes), count, limit, offset })
}
