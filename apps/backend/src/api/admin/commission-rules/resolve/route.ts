import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { commissionFor, commissionSvc, resolveRule } from "../../../../lib/commission"
import { cents } from "../../../../lib/money"
import { parse } from "../../../../lib/parse"
import { planIdsFor } from "../../../../lib/plans"
import { shapeRule } from "../helpers"

const Q = z.object({
  vendor_id: z.string().min(1),
  category_id: z.string().optional(),
  channel: z.enum(["b2c", "b2b"]),
  amount: z.coerce.number().min(0).default(100),
  date: z.coerce.date().optional(),
})

// "Which rule applies" tester: same resolution as order placement.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const q = parse(Q, req.query)
  const plan_id = (await planIdsFor(req.scope, [q.vendor_id])).get(q.vendor_id) ?? null
  const rules = await commissionSvc(req.scope).listCommissionRules({})
  const rule = resolveRule(rules, { vendor_id: q.vendor_id, plan_id, category_ids: q.category_id ? [q.category_id] : [], channel: q.channel, at: q.date })
  res.json({ rule: rule ? shapeRule(rule) : null, commission: commissionFor(rule, cents(q.amount)).amount, plan_id })
}
