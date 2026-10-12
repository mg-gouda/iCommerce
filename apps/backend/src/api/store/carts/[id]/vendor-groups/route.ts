import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { listShippingOptionsForCartWorkflow } from "@medusajs/medusa/core-flows"
import VendorProductLink from "../../../../../links/vendor-product"
import { profileName } from "../../../../../lib/vendor-shipping"
import { VENDOR_MODULE } from "../../../../../modules/vendor"
import type VendorModuleService from "../../../../../modules/vendor/service"

// Cart items grouped by vendor, each with only that vendor's priced shipping options.
// Storefront picks one option per group → POST /store/carts/:id/shipping-methods.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [cart],
  } = await query.graph(
    { entity: "cart", fields: ["id", "items.id", "items.product_id", "shipping_methods.shipping_option_id"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true },
  )
  const items = (cart.items ?? []).filter(Boolean) as { id: string; product_id: string }[]
  const { data: links } = await query.graph({
    entity: VendorProductLink.entryPoint,
    fields: ["vendor_id", "product_id"],
    filters: { product_id: items.map((i) => i.product_id) },
  })
  const vendorOf = new Map(links.map((l: { product_id: string; vendor_id: string }) => [l.product_id, l.vendor_id]))
  const vendors = vendorOf.size
    ? await req.scope.resolve<VendorModuleService>(VENDOR_MODULE).listVendors({ id: [...new Set(vendorOf.values())] })
    : []
  if (!vendors.length) return res.json({ vendor_groups: [] })

  const ful = req.scope.resolve(Modules.FULFILLMENT)
  const profiles = await ful.listShippingProfiles({ name: vendors.map((v) => profileName(v.handle)) }, { select: ["id", "name"] })
  const profileOf = new Map(profiles.map((p) => [p.name, p.id]))
  const optionIds = (await ful.listShippingOptions({ shipping_profile_id: profiles.map((p) => p.id) }, { select: ["id"] })).map((o) => o.id)
  const priced = optionIds.length
    ? (await listShippingOptionsForCartWorkflow(req.scope).run({ input: { cart_id: cart.id, option_ids: optionIds, is_return: false } })).result
    : []
  const chosen = new Set((cart.shipping_methods ?? []).map((m) => m?.shipping_option_id))

  res.json({
    vendor_groups: vendors.map((v) => {
      const shipping_profile_id = profileOf.get(profileName(v.handle)) ?? null
      const options = priced.filter((o) => o.shipping_profile_id === shipping_profile_id)
      return {
        vendor: { id: v.id, name: v.name, handle: v.handle },
        shipping_profile_id,
        item_ids: items.filter((i) => vendorOf.get(i.product_id) === v.id).map((i) => i.id),
        selected_option_id: options.find((o) => chosen.has(o.id))?.id ?? null,
        shipping_options: options.map((o) => ({
          id: o.id,
          name: o.name,
          kind: o.metadata?.kind ?? "flat",
          amount: o.amount,
          free_over: o.metadata?.free_over ?? null,
        })),
      }
    }),
  })
}
