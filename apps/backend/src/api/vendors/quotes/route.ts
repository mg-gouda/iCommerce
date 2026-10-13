import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { companySvc } from "../../../lib/company"
import { listQuery, parse } from "../../../lib/parse"
import { quoteSvc, shapeQuotes } from "../../../lib/quotes"
import { QUOTE_STATUSES } from "../../../modules/quote/models/quote"
import { getCaller } from "../helpers"

const List = z.object({ status: z.enum(QUOTE_STATUSES).optional(), q: z.string().trim().optional(), ...listQuery })

// Vendor inbox, newest first. `q` matches the buyer company's name.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { status, q, limit, offset } = parse(List, req.query)
  const { vendor } = await getCaller(req)
  const company_id = q ? (await companySvc(req.scope).listCompanies({ q }, { select: ["id"] })).map((c) => c.id) : undefined
  if (company_id && !company_id.length) return res.json({ quotes: [], count: 0, limit, offset })
  const [quotes, count] = await quoteSvc(req.scope).listAndCountQuotes(
    { vendor_id: vendor.id, ...(status && { status }), ...(company_id && { company_id }) },
    { relations: ["items"], order: { created_at: "DESC" }, skip: offset, take: limit },
  )
  res.json({ quotes: await shapeQuotes(req.scope, quotes), count, limit, offset })
}
