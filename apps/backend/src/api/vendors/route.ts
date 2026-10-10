import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules, toHandle } from "@medusajs/framework/utils"
import { createVendorWorkflow } from "../../workflows/create-vendor"
import type { PostVendorApplyType } from "./validators"

// Apply as vendor. Caller holds a registration token from POST /auth/vendor/emailpass/register.
export async function POST(req: AuthenticatedMedusaRequest<PostVendorApplyType>, res: MedusaResponse) {
  if (req.auth_context.actor_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Request already authenticated as a vendor.")
  }
  const { first_name, last_name, handle, ...vendor } = req.validatedBody
  // Login email comes from the auth identity, never the body, so nobody can claim someone else's address.
  const identity = await req.scope
    .resolve(Modules.AUTH)
    .retrieveAuthIdentity(req.auth_context.auth_identity_id, { relations: ["provider_identities"] })
  const email = identity.provider_identities?.find((p) => p.provider === "emailpass")?.entity_id
  if (!email) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Vendor apply requires an emailpass identity.")

  const { result } = await createVendorWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      vendor: { ...vendor, handle: handle ?? toHandle(vendor.name), email: vendor.email ?? email },
      user: { email, first_name: first_name ?? undefined, last_name: last_name ?? undefined },
    },
  })
  res.status(201).json(result)
}
