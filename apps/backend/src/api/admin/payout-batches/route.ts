import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { createBatch, payoutSvc, shapeBatches } from "../../../lib/ledger"
import { parse } from "../../../lib/parse"

const List = z.object({
  vendor_id: z.string().optional(),
  status: z.enum(["open", "paid"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor_id, status, limit, offset } = parse(List, req.query)
  const [batches, count] = await payoutSvc(req.scope).listAndCountPayoutBatches(
    { ...(vendor_id && { vendor_id }), ...(status && { status }) },
    { order: { created_at: "DESC" }, skip: offset, take: limit },
  )
  res.json({ batches: await shapeBatches(req.scope, batches), count, limit, offset })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor_id } = parse(z.object({ vendor_id: z.string().min(1) }).strict(), req.body)
  const batch = await createBatch(req.scope, vendor_id)
  res.status(201).json({ batch: (await shapeBatches(req.scope, [batch]))[0] })
}
