import { setAuthAppMetadataStep } from "@medusajs/medusa/core-flows"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"

export type CreateVendorInput = {
  auth_identity_id: string
  vendor: Record<string, unknown> & { name: string; handle: string }
  user: { email: string; first_name?: string; last_name?: string }
}

const createVendorStep = createStep(
  "create-vendor",
  async (input: CreateVendorInput, { container }) => {
    const svc: VendorModuleService = container.resolve(VENDOR_MODULE)
    // Applicants can never self-approve: status/kyc fields are forced here.
    const vendor = await svc.createVendors({ ...input.vendor, status: "pending", kyc_status: "none" })
    const user = await svc.createVendorUsers({ ...input.user, role: "owner", vendor_id: vendor.id })
    return new StepResponse({ vendor, user }, { vendor_id: vendor.id, user_id: user.id })
  },
  async (ids, { container }) => {
    if (!ids) return
    const svc: VendorModuleService = container.resolve(VENDOR_MODULE)
    await svc.deleteVendorUsers(ids.user_id)
    await svc.deleteVendors(ids.vendor_id)
  },
)

export const createVendorWorkflow = createWorkflow("create-vendor", (input: CreateVendorInput) => {
  const { vendor, user } = createVendorStep(input)
  setAuthAppMetadataStep({
    authIdentityId: input.auth_identity_id,
    actorType: "vendor",
    value: user.id,
  })
  return new WorkflowResponse({ vendor, user })
})
