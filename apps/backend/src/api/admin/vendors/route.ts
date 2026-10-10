import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../modules/vendor"
import type VendorModuleService from "../../../modules/vendor/service"
import { GetAdminVendors } from "./validators"

// /admin/* is admin-authenticated by default in Medusa.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = GetAdminVendors.safeParse(req.query)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.message)
  const { q, status, kyc_status, limit, offset } = parsed.data
  const vendors: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const [items, count] = await vendors.listAndCountVendors(
    { ...(q && { q }), ...(status && { status }), ...(kyc_status && { kyc_status }) },
    { order: { created_at: "DESC" }, take: limit, skip: offset, relations: ["users"] },
  )
  res.json({ vendors: items, count, limit, offset })
}
