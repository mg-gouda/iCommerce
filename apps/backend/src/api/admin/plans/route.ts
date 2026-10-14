import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parse } from "../../../lib/parse"
import { planSvc, shapePlan } from "../../../lib/plans"
import { PlanBody } from "./helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc = planSvc(req.scope)
  const plans = await svc.listPlans({})
  plans.sort((a, b) => Number(a.price_usd) - Number(b.price_usd))
  const subs = await svc.listVendorSubscriptions({ status: ["trial", "active", "past_due"] }, { relations: ["plan"] })
  res.json({ plans: plans.map((p) => ({ ...shapePlan(p), subscribers: subs.filter((s) => s.plan.id === p.id).length })) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(PlanBody.partial({ product_limit: true, staff_limit: true, featured_slots: true, active: true }), req.body)
  res.status(201).json({ plan: shapePlan(await planSvc(req.scope).createPlans(body)) })
}
