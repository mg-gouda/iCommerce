import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import type VendorModuleService from "../../../../modules/vendor/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  res.json({ vendor: await svc.retrieveVendor(req.params.id, { relations: ["users"] }) })
}
