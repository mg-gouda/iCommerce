import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import VendorProductLink from "../links/vendor-product"
import { ensureVendorShipping } from "../lib/vendor-shipping"
import { VENDOR_MODULE } from "../modules/vendor"
import type VendorModuleService from "../modules/vendor/service"

// medusa exec ./src/scripts/backfill-vendor-shipping.ts — one-off, idempotent. Run after seed-defaults.
// Every vendor gets its shipping profile/location/zone; every vendor product moves to its vendor's profile.
export default async function backfillVendorShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const vendors = await container.resolve<VendorModuleService>(VENDOR_MODULE).listVendors({}, { select: ["id", "name", "handle", "city"] })
  let moved = 0
  for (const vendor of vendors) {
    const { shipping_profile_id } = await ensureVendorShipping(container, vendor)
    const { data: links } = await query.graph({ entity: VendorProductLink.entryPoint, fields: ["product_id"], filters: { vendor_id: vendor.id } })
    if (!links.length) continue
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "shipping_profile.id"],
      filters: { id: links.map((l: { product_id: string }) => l.product_id) },
    })
    const ids = products.filter((p) => p.shipping_profile?.id !== shipping_profile_id).map((p) => p.id)
    for (let i = 0; i < ids.length; i += 200) {
      await updateProductsWorkflow(container).run({ input: { selector: { id: ids.slice(i, i + 200) }, update: { shipping_profile_id } } })
    }
    moved += ids.length
  }
  logger.info(`backfill-vendor-shipping: ${vendors.length} vendors ready, ${moved} products moved to their vendor's shipping profile`)
}
