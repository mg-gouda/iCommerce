import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import type { UpdateProductDTO } from "@medusajs/framework/types"
import { updateVendorProductWorkflow } from "../../../../workflows/vendor-products"
import { ensureVendorShipping } from "../../../../lib/vendor-shipping"
import { gateStatus, getCaller } from "../../helpers"
import { PostVendorProductUpdate } from "../../validators"
import { retrieveVendorProduct, vendorProductIds } from "../helpers"

// Isolation: another vendor's product is indistinguishable from a missing one (404).
async function ownedOr404(req: AuthenticatedMedusaRequest) {
  const caller = await getCaller(req)
  const [owned] = await vendorProductIds(req.scope, caller.vendor.id, req.params.id)
  if (!owned) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id "${req.params.id}" not found`)
  return caller
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await ownedOr404(req)
  res.json({ product: await retrieveVendorProduct(req.scope, req.params.id) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await ownedOr404(req)
  const body = PostVendorProductUpdate.safeParse(req.body)
  if (!body.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, body.error.message)
  const { extra, status: requested, ...update } = body.data
  const status = gateStatus(vendor.status, requested)
  // Re-assert the vendor's shipping profile on every edit (heals products created before P2).
  const { shipping_profile_id } = await ensureVendorShipping(req.scope, vendor)
  await updateVendorProductWorkflow(req.scope).run({
    input: { id: req.params.id, update: { ...update, ...(status && { status }), shipping_profile_id } as UpdateProductDTO, extra },
  })
  res.json({ product: await retrieveVendorProduct(req.scope, req.params.id) })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await ownedOr404(req)
  await deleteProductsWorkflow(req.scope).run({ input: { ids: [req.params.id] } })
  res.json({ id: req.params.id, object: "product", deleted: true })
}
