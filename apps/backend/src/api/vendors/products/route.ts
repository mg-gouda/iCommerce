import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import { createVendorProductWorkflow } from "../../../workflows/vendor-products"
import { ensureVendorShipping } from "../../../lib/vendor-shipping"
import { assertProductLimit } from "../../../lib/plans"
import { gateStatus, getCaller } from "../helpers"
import { GetVendorProducts, type PostVendorProductType } from "../validators"
import { retrieveVendorProduct, salesChannelsFor, VENDOR_PRODUCT_FIELDS, vendorProductIds } from "./helpers"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = GetVendorProducts.safeParse(req.query)
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.message)
  const { q, status, limit, offset } = parsed.data

  const { vendor } = await getCaller(req)
  const ids = await vendorProductIds(req.scope, vendor.id)
  if (!ids.length) return res.json({ products: [], count: 0, limit, offset })

  const { data, metadata } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: VENDOR_PRODUCT_FIELDS,
    filters: { id: ids, ...(status && { status }), ...(q && { q }) },
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })
  res.json({ products: data, count: metadata?.count ?? data.length, limit, offset })
}

export async function POST(req: AuthenticatedMedusaRequest<PostVendorProductType>, res: MedusaResponse) {
  const { vendor } = await getCaller(req)
  const { extra = {}, ...product } = req.validatedBody
  await assertProductLimit(req.scope, vendor.id)
  const { result } = await createVendorProductWorkflow(req.scope).run({
    input: {
      vendor_id: vendor.id,
      product: {
        ...product,
        status: gateStatus(vendor.status, product.status ?? "draft"),
        sales_channels: await salesChannelsFor(req.scope, extra),
        shipping_profile_id: (await ensureVendorShipping(req.scope, vendor)).shipping_profile_id,
      } as CreateProductWorkflowInputDTO,
      extra,
    },
  })
  res.status(201).json({ product: await retrieveVendorProduct(req.scope, result.id) })
}
