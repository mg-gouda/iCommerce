import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"

// /admin/* is admin-authenticated by default in Medusa.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const vendors: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const [items, count] = await vendors.listAndCountVendors({}, { order: { created_at: "DESC" } })
  res.json({ vendors: items, count })
}
