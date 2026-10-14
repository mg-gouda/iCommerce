import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { markBatchPaid, shapeBatches } from "../../../../../lib/ledger"
import { parse } from "../../../../../lib/parse"

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { reference } = parse(z.object({ reference: z.string().trim().min(1).max(120) }).strict(), req.body)
  const batch = await markBatchPaid(req.scope, req.params.id, reference)
  res.json({ batch: (await shapeBatches(req.scope, [batch]))[0] })
}
