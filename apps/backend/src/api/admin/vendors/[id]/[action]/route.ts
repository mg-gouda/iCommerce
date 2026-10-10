import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import type VendorModuleService from "../../../../../modules/vendor/service"
import type { PostAdminVendorNoteType } from "../../validators"

type Patch = {
  status?: "approved" | "suspended"
  kyc_status?: "verified" | "rejected"
  kyc_note: string | null
}

const ACTIONS = new Map<string, (note?: string) => Patch>([
  ["approve", (note) => ({ status: "approved", kyc_status: "verified", kyc_note: note ?? null })],
  ["reject", (note) => ({ kyc_status: "rejected", kyc_note: note ?? null })],
  ["suspend", (note) => ({ status: "suspended", kyc_note: note ?? null })],
])

// POST /admin/vendors/:id/{approve|reject|suspend}  body: { note? }  (note required for reject)
export async function POST(req: AuthenticatedMedusaRequest<PostAdminVendorNoteType>, res: MedusaResponse) {
  const action = ACTIONS.get(req.params.action)
  if (!action) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Unknown action "${req.params.action}"`)
  const note = req.validatedBody?.note
  if (req.params.action === "reject" && !note) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "note is required when rejecting")
  }
  const svc: VendorModuleService = req.scope.resolve(VENDOR_MODULE)
  await svc.retrieveVendor(req.params.id) // 404 if missing
  const vendor = await svc.updateVendors({ id: req.params.id, ...action(note) })
  res.json({ vendor })
}
