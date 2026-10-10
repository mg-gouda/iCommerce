import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { ProductStatus } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../modules/vendor"
import type VendorModuleService from "../../modules/vendor/service"

// Caller's vendor, resolved from the vendor_user id that `authenticate("vendor", ...)` put in auth_context.
export async function getCaller(req: AuthenticatedMedusaRequest) {
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  const { vendor, ...user } = await svc.retrieveVendorUser(req.auth_context.actor_id, { relations: ["vendor"] })
  return { vendor, user }
}

// Only approved vendors may publish. Non-approved vendors' writes always land in `draft` or `proposed` (review),
// so an edit by a suspended vendor un-publishes. `undefined` = keep current status (approved vendors' edits only).
export function gateStatus(vendorStatus: string, requested?: string | null) {
  const approved = vendorStatus === "approved"
  if (requested === ProductStatus.DRAFT) return ProductStatus.DRAFT
  if (approved && requested === ProductStatus.PUBLISHED) return ProductStatus.PUBLISHED
  if (approved && requested == null) return undefined
  return ProductStatus.PROPOSED
}
