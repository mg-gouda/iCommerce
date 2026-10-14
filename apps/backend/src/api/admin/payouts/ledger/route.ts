import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { LedgerQuery, payoutSvc, shapeEntry } from "../../../../lib/ledger"
import { parse } from "../../../../lib/parse"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor_id, type, status, limit, offset } = parse(LedgerQuery.extend({ vendor_id: z.string().optional() }), req.query)
  const [entries, count] = await payoutSvc(req.scope).listAndCountLedgerEntries(
    { ...(vendor_id && { vendor_id }), ...(type && { type }), ...(status && { status }) },
    { order: { created_at: "DESC" }, skip: offset, take: limit },
  )
  res.json({ entries: entries.map(shapeEntry), count, limit, offset })
}
