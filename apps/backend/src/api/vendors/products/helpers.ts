import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import VendorProductLink from "../../../links/vendor-product"

export const VENDOR_PRODUCT_FIELDS = [
  "*",
  "variants.*",
  "variants.prices.*",
  "options.*",
  "options.values.*",
  "images.*",
  "categories.id",
  "categories.name",
  "categories.handle",
  "sales_channels.id",
  "sales_channels.name",
  "product_extra.*",
]

export async function vendorProductIds(scope: MedusaContainer, vendor_id: string, product_id?: string) {
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: VendorProductLink.entryPoint,
    fields: ["product_id"],
    filters: product_id ? { vendor_id, product_id } : { vendor_id },
  })
  return data.map((l: { product_id: string }) => l.product_id)
}

export async function retrieveVendorProduct(scope: MedusaContainer, id: string) {
  const {
    data: [product],
  } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: VENDOR_PRODUCT_FIELDS,
    filters: { id },
  })
  return product
}

// Wholesale always; Retail too unless the product is B2B-only / B2C disabled.
// ponytail: channels looked up by seeded name, no admin config for this mapping yet.
export async function salesChannelsFor(scope: MedusaContainer, extra?: { b2b_only?: boolean; b2c_enabled?: boolean }) {
  const retail = !extra?.b2b_only && extra?.b2c_enabled !== false
  const channels = await scope
    .resolve(Modules.SALES_CHANNEL)
    .listSalesChannels({ name: retail ? ["Wholesale", "Retail"] : ["Wholesale"] }, { select: ["id"] })
  return channels.map((c) => ({ id: c.id }))
}
