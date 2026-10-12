import type { MedusaContainer, WorkflowTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

export const MANUAL_PROVIDER = "manual_manual"
export const profileName = (handle: string) => `vendor_${handle}`

type VendorRef = { handle: string; name: string; city?: string | null }

/**
 * Idempotent: per vendor one shipping profile, stock location and fulfillment set (one service zone covering Egypt),
 * all named `vendor_<handle>`; location linked to the manual provider + every sales channel.
 * Called lazily (product writes, shipping-option routes, backfill, seeds).
 * ponytail: no lock; two concurrent first-time calls for one vendor may race (profile name is unique → one fails, retry fixes).
 */
export async function ensureVendorShipping(container: MedusaContainer, vendor: VendorRef) {
  const name = profileName(vendor.handle)
  const ful = container.resolve(Modules.FULFILLMENT)
  const loc = container.resolve(Modules.STOCK_LOCATION)

  const [profile = await ful.createShippingProfiles({ name, type: "default" })] = await ful.listShippingProfiles({ name })
  const [location = await loc.createStockLocations({ name, address: { address_1: vendor.name, city: vendor.city ?? null, country_code: "EG" } })] =
    await loc.listStockLocations({ name })
  let [set] = await ful.listFulfillmentSets({ name }, { relations: ["service_zones"] })
  if (!set) {
    const created = await ful.createFulfillmentSets({
      name,
      type: "shipping",
      service_zones: [{ name, geo_zones: [{ type: "country", country_code: "eg" }] }],
    })
    ;[set] = await ful.listFulfillmentSets({ id: created.id }, { relations: ["service_zones"] })
    const channels = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({}, { select: ["id"] })
    // Link writes are upserts → safe to repeat.
    await container.resolve(ContainerRegistrationKeys.LINK).create([
      { [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_set_id: set.id } },
      { [Modules.STOCK_LOCATION]: { stock_location_id: location.id }, [Modules.FULFILLMENT]: { fulfillment_provider_id: MANUAL_PROVIDER } },
      ...channels.map((c) => ({ [Modules.SALES_CHANNEL]: { sales_channel_id: c.id }, [Modules.STOCK_LOCATION]: { stock_location_id: location.id } })),
    ])
  }
  return { shipping_profile_id: profile.id, location_id: location.id, service_zone_id: set.service_zones[0].id }
}

type Opt = { id: string; name: string; metadata?: Record<string, unknown> | null; prices?: { amount: unknown; price_rules?: unknown[] }[] }

// Base price = the one without rules (free_over adds a conditional 0 price).
const shapeOption = (o: Opt) => ({
  id: o.id,
  name: o.name,
  kind: (o.metadata?.kind ?? "flat") as "flat" | "free_over" | "pickup",
  amount: Number(o.prices?.find((p) => !p.price_rules?.length)?.amount ?? 0),
  free_over: (o.metadata?.free_over ?? null) as number | null,
  currency_code: "usd",
})
export type VendorShippingOption = ReturnType<typeof shapeOption>

/** Vendor's options (optionally one id → [] when it isn't theirs). */
export async function listVendorOptions(container: MedusaContainer, shipping_profile_id: string, id?: string) {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "shipping_option",
    fields: ["id", "name", "metadata", "prices.amount", "prices.price_rules.attribute"],
    filters: { shipping_profile_id, ...(id && { id }) },
  })
  return (data as Opt[]).map(shapeOption)
}

export type NewOption = { name: string; kind: "flat" | "free_over" | "pickup"; amount?: number; free_over?: number | null }

/** USD only (catalog + region are USD). ponytail: free_over threshold = whole cart item total (Medusa `item_total` price rule), not the vendor's share. */
export async function createVendorOption(container: MedusaContainer, vendor: VendorRef & { id: string }, o: NewOption) {
  const { shipping_profile_id, service_zone_id } = await ensureVendorShipping(container, vendor)
  const amount = o.kind === "pickup" ? 0 : (o.amount ?? 0)
  const free = o.kind === "free_over" ? (o.free_over ?? null) : null
  const { result } = await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: o.name,
        service_zone_id,
        shipping_profile_id,
        provider_id: MANUAL_PROVIDER,
        price_type: "flat",
        type: { label: o.kind, description: o.kind, code: o.kind },
        prices: [
          { currency_code: "usd", amount },
          ...(free != null ? [{ currency_code: "usd", amount: 0, rules: [{ attribute: "item_total", operator: "gte" as const, value: free }] }] : []),
        ],
        rules: [
          { attribute: "enabled_in_store", operator: "eq", value: "true" },
          { attribute: "is_return", operator: "eq", value: "false" },
        ],
        // Passed through to the model (column exists); the workflow input type just doesn't declare it.
        metadata: { vendor_id: vendor.id, vendor_name: vendor.name, vendor_handle: vendor.handle, kind: o.kind, free_over: free },
      } as WorkflowTypes.FulfillmentWorkflow.CreateShippingOptionsWorkflowInput,
    ],
  })
  return (await listVendorOptions(container, shipping_profile_id, result[0].id))[0]
}
