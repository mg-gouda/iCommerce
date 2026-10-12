import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import { ensureVendorShipping, listVendorOptions } from "../../../../lib/vendor-shipping"
import { getCaller } from "../../helpers"

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  const { shipping_profile_id } = await ensureVendorShipping(req.scope, vendor)
  if (!(await listVendorOptions(req.scope, shipping_profile_id, req.params.id)).length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Shipping option with id "${req.params.id}" not found`)
  }
  await deleteShippingOptionsWorkflow(req.scope).run({ input: { ids: [req.params.id] } })
  res.json({ id: req.params.id, object: "shipping_option", deleted: true })
}
