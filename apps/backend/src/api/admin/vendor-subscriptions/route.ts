import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { parse } from "../../../lib/parse"
import { planSvc } from "../../../lib/plans"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"
import { resyncVendor, shapeSubs, SUB_STATUSES } from "../plans/helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const q = parse(
    z.object({ status: z.enum(SUB_STATUSES).optional(), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }),
    req.query,
  )
  const [subs, count] = await planSvc(req.scope).listAndCountVendorSubscriptions(q.status ? { status: q.status } : {}, {
    relations: ["plan"], order: { updated_at: "DESC" }, skip: q.offset, take: q.limit,
  })
  res.json({ subscriptions: await shapeSubs(req.scope, subs), count, limit: q.limit, offset: q.offset })
}

// Upsert: change plan / status / period (e.g. start a trial).
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = parse(
    z.object({ vendor_id: z.string().min(1), plan_id: z.string().min(1), status: z.enum(SUB_STATUSES).optional(), current_period_end: z.coerce.date().nullable().optional() }).strict(),
    req.body,
  )
  const svc = planSvc(req.scope)
  await req.scope.resolve<VendorModuleService>(VENDOR_MODULE).retrieveVendor(body.vendor_id)
  if (!(await svc.listPlans({ id: body.plan_id })).length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unknown plan.")
  const [row] = await svc.listVendorSubscriptions({ vendor_id: body.vendor_id })
  const data = {
    plan_id: body.plan_id,
    ...(body.status && { status: body.status }),
    ...(body.current_period_end !== undefined && { current_period_end: body.current_period_end }),
    ...(row?.requested_plan_id === body.plan_id && { requested_plan_id: null }),
  }
  const saved = row
    ? await svc.updateVendorSubscriptions({ id: row.id, ...data })
    : await svc.createVendorSubscriptions({ vendor_id: body.vendor_id, status: "active", current_period_start: new Date(), ...data })
  await resyncVendor(req.scope, body.vendor_id)
  const [full] = await svc.listVendorSubscriptions({ id: saved.id }, { relations: ["plan"] })
  res.json({ subscription: (await shapeSubs(req.scope, [full]))[0] })
}
