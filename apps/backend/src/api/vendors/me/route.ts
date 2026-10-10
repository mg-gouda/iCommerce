import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"
import { getCaller } from "../helpers"
import type { PostVendorMeType } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await getCaller(req))
}

// Allowed for any vendor status (pending/suspended included). Status/KYC fields are not in the schema.
export async function POST(req: AuthenticatedMedusaRequest<PostVendorMeType>, res: MedusaResponse) {
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const { vendor } = await getCaller(req)
  await svc.updateVendors({ id: vendor.id, ...req.validatedBody })
  res.json(await getCaller(req))
}
