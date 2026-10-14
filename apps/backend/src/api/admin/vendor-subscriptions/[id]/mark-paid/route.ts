import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { parse } from "../../../../../lib/parse"
import { nextPeriod, planSvc } from "../../../../../lib/plans"
import { resyncVendor, shapeSubs } from "../../../plans/helpers"

// Manual billing: one period paid → active, next period; optional plan change (e.g. an upgrade request).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { plan_id } = parse(z.object({ plan_id: z.string().min(1).optional() }).strict(), req.body ?? {})
  const svc = planSvc(req.scope)
  const [sub] = await svc.listVendorSubscriptions({ id: req.params.id }, { relations: ["plan"] })
  if (!sub) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Subscription with id "${req.params.id}" not found`)
  const [plan] = plan_id ? await svc.listPlans({ id: plan_id }) : [sub.plan]
  if (!plan) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown plan.")
  await svc.updateVendorSubscriptions({
    id: sub.id, plan_id: plan.id, status: "active", ...nextPeriod(sub, plan.interval),
    ...((!sub.requested_plan_id || sub.requested_plan_id === plan.id) && { requested_plan_id: null }),
  })
  await resyncVendor(req.scope, sub.vendor_id)
  const [full] = await svc.listVendorSubscriptions({ id: sub.id }, { relations: ["plan"] })
  res.json({ subscription: (await shapeSubs(req.scope, [full]))[0] })
}
