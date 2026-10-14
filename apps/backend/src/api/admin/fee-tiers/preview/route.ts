import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { computeFee, feeSvc } from "../../../../lib/fees"
import { cents } from "../../../../lib/money"
import { parse } from "../../../../lib/parse"

const Q = z.object({ channel: z.enum(["b2b", "b2c"]), subtotal: z.coerce.number().min(0), monthly_volume: z.coerce.number().min(0).default(0) })

// Calculator: fee for a subtotal + the buyer's prior volume this month, with today's tiers.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const q = parse(Q, req.query)
  const tiers = await feeSvc(req.scope).listFeeTiers({ channel: q.channel })
  res.json({ fee: computeFee(tiers as never, q.channel, cents(q.subtotal), cents(q.monthly_volume)) })
}
