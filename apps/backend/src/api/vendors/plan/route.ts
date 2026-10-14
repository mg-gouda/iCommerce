import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { graceDays, planSvc, productIdsOf, shapePlan, vendorPlanState } from "../../../lib/plans"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"
import { getCaller } from "../helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  const subscription = await vendorPlanState(req.scope, vendor.id)
  const plans = await planSvc(req.scope).listPlans({ active: true })
  plans.sort((a, b) => Number(a.price_usd) - Number(b.price_usd))
  const end = subscription.current_period_end
  res.json({
    subscription,
    plan: subscription.plan,
    usage: {
      products: (await productIdsOf(req.scope, [vendor.id])).length,
      staff: (await req.scope.resolve<VendorModuleService>(VENDOR_MODULE).listVendorUsers({ vendor_id: vendor.id } as never)).length,
    },
    plans: plans.map(shapePlan),
    grace_until: subscription.status === "past_due" && end ? new Date(+new Date(end) + graceDays() * 86_400_000) : null,
  })
}
