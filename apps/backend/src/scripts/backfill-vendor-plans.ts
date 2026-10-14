import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { planSvc } from "../lib/plans"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"

const TRIAL_DAYS = 60

// medusa exec ./src/scripts/backfill-vendor-plans.ts — run once after seed-defaults (P4).
// Approved vendors without a subscription (imported ones included) → Business, trial 60 days. Re-runs only touch vendors still
// without a row; vendors approved later stay on Starter (no row) until an admin changes their plan.
export default async function backfillVendorPlans({ container }: ExecArgs) {
  const svc = planSvc(container)
  const [business] = await svc.listPlans({ handle: "business" })
  if (!business) throw new Error("Plan 'business' missing: run seed-defaults first.")
  const vendors = await (container.resolve(VENDOR_MODULE) as VendorModuleService).listVendors({ status: "approved" }, { select: ["id"] })
  const have = new Set((await svc.listVendorSubscriptions({}, { select: ["vendor_id"] })).map((s) => s.vendor_id))
  const now = new Date()
  const rows = vendors
    .filter((v) => !have.has(v.id))
    .map((v) => ({ vendor_id: v.id, plan_id: business.id, status: "trial" as const, current_period_start: now, current_period_end: new Date(+now + TRIAL_DAYS * 86_400_000) }))
  for (let i = 0; i < rows.length; i += 500) await svc.createVendorSubscriptions(rows.slice(i, i + 500))
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`backfill-vendor-plans: ${rows.length} vendors → Business trial ${TRIAL_DAYS} days`)
}
