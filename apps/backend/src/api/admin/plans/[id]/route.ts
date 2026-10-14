import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { parse } from "../../../../lib/parse"
import { planSvc, shapePlan } from "../../../../lib/plans"
import { PlanBody } from "../helpers"

// No delete: plans with subscribers would dangle → set active: false.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(PlanBody.partial(), req.body)
  const svc = planSvc(req.scope)
  await svc.retrievePlan(req.params.id)
  res.json({ plan: shapePlan(await svc.updatePlans({ id: req.params.id, ...body })) })
}
