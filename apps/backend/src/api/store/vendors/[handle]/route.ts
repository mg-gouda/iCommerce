import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import type VendorModuleService from "../../../../modules/vendor/service"

const PUBLIC_FIELDS = ["id", "name", "handle", "logo", "banner", "description", "city", "country", "kyc_status"] as const

// Public store profile. Approved vendors only; pending/suspended/missing all 404 alike.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const [vendor] = await svc.listVendors({ handle: req.params.handle, status: "approved" }, { select: [...PUBLIC_FIELDS] })
  if (!vendor) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Vendor ${req.params.handle} not found`)
  res.json({ vendor })
}
