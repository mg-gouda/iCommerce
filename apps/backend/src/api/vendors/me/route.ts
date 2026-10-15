import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { vendorPlanState } from "../../../lib/plans"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"
import { getCaller } from "../helpers"
import type { PostVendorMeType } from "../validators"

// P4: + plan summary for portal banners.
async function me(req: AuthenticatedMedusaRequest) {
  const caller = await getCaller(req)
  const s = await vendorPlanState(req.scope, caller.vendor.id)
  const plan = {
    handle: s.plan?.handle ?? null, name_en: s.plan?.name_en ?? null, name_ar: s.plan?.name_ar ?? null,
    status: s.status, current_period_end: s.current_period_end, read_only: s.read_only, past_due: s.status === "past_due",
    can_b2b: s.plan?.can_b2b ?? true,
  }
  return { ...caller, plan }
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await me(req))
}

// Allowed for any vendor status (pending/suspended included). Status/KYC fields are not in the schema.
export async function POST(req: AuthenticatedMedusaRequest<PostVendorMeType>, res: MedusaResponse) {
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const { vendor } = await getCaller(req)
  await svc.updateVendors({ id: vendor.id, ...req.validatedBody })
  res.json(await me(req))
}
