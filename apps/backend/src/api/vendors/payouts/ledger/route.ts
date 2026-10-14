import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LedgerQuery, payoutSvc, shapeEntry } from "../../../../lib/ledger"
import { parse } from "../../../../lib/parse"
import { getCaller } from "../../helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { type, status, limit, offset } = parse(LedgerQuery, req.query)
  const { vendor } = await getCaller(req)
  const [entries, count] = await payoutSvc(req.scope).listAndCountLedgerEntries(
    { vendor_id: vendor.id, ...(type && { type }), ...(status && { status }) },
    { order: { created_at: "DESC" }, skip: offset, take: limit },
  )
  res.json({ entries: entries.map(shapeEntry), count, limit, offset })
}
