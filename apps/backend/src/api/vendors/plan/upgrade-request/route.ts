import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { parse } from "../../../../lib/parse"
import { notifyAdmins, planSvc, vendorPlanState } from "../../../../lib/plans"
import { getCaller } from "../../helpers"

// Vendor asks for another plan → stored on the subscription (admin sees it) + admin notification. Billing stays manual.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { plan_id } = parse(z.object({ plan_id: z.string().min(1) }).strict(), req.body)
  const { vendor } = await getCaller(req)
  const svc = planSvc(req.scope)
  const [plan] = await svc.listPlans({ id: plan_id, active: true })
  if (!plan) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown plan.")
  const current = await vendorPlanState(req.scope, vendor.id)
  if (current.plan_id === plan.id) throw new MedusaError(MedusaError.Types.INVALID_DATA, "You are already on this plan.")
  // ponytail: Starter vendors have no row yet → the request creates one on their current (Starter) plan.
  const [row] = await svc.listVendorSubscriptions({ vendor_id: vendor.id })
  if (row) await svc.updateVendorSubscriptions({ id: row.id, requested_plan_id: plan.id })
  else await svc.createVendorSubscriptions({ vendor_id: vendor.id, plan_id: current.plan_id!, status: "active", requested_plan_id: plan.id })
  await notifyAdmins(req.scope, "Plan upgrade request", `${vendor.name} requests the ${plan.name_en} plan (USD ${Number(plan.price_usd)}/${plan.interval}).`)
  res.json({ subscription: await vendorPlanState(req.scope, vendor.id) })
}
