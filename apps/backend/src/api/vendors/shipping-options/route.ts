import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { createVendorOption, ensureVendorShipping, listVendorOptions } from "../../../lib/vendor-shipping"
import { getCaller } from "../helpers"
import { PostShippingOption } from "../orders/validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  const { shipping_profile_id } = await ensureVendorShipping(req.scope, vendor)
  res.json({ shipping_options: await listVendorOptions(req.scope, shipping_profile_id) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const body = PostShippingOption.safeParse(req.body)
  if (!body.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, body.error.message)
  const { vendor } = await getCaller(req)
  res.status(201).json({ shipping_option: await createVendorOption(req.scope, vendor, body.data) })
}
