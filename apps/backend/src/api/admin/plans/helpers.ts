import type { MedusaContainer } from "@medusajs/framework/types"
import { z } from "@medusajs/framework/zod"
import { money } from "../../../lib/parse"
import { planSvc, productIdsOf, shapePlan, shapeSubscription } from "../../../lib/plans"
import { syncProduct } from "../../../lib/search"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export const SUB_STATUSES = ["trial", "active", "past_due", "cancelled"] as const

const limit = z.number().int().min(0).nullable()
export const PlanBody = z
  .object({
    handle: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name_en: z.string().trim().min(1).max(60),
    name_ar: z.string().trim().min(1).max(60),
    price_usd: money,
    interval: z.enum(["monthly", "yearly"]),
    product_limit: limit,
    staff_limit: limit,
    featured_slots: z.number().int().min(0),
    can_b2b: z.boolean(),
    analytics_level: z.enum(["basic", "full"]),
    active: z.boolean(),
  })
  .strict()

export async function shapeSubs(scope: MedusaContainer, subs: Row[]) {
  if (!subs.length) return []
  const vendors = await scope.resolve<VendorModuleService>(VENDOR_MODULE).listVendors({ id: subs.map((s) => s.vendor_id) }, { select: ["id", "name", "handle"] })
  const requested = await planSvc(scope).listPlans({ id: subs.map((s) => s.requested_plan_id).filter(Boolean) })
  return subs.map((s) => {
    const p = requested.find((r) => r.id === s.requested_plan_id)
    return { ...shapeSubscription(s), vendor: vendors.find((v) => v.id === s.vendor_id) ?? null, requested_plan: p ? shapePlan(p) : null }
  })
}

/** Plan / status change may hide or unhide the vendor's products → re-sync search. */
export async function resyncVendor(scope: MedusaContainer, vendor_id: string) {
  for (const id of await productIdsOf(scope, [vendor_id])) await syncProduct(scope, id)
}
