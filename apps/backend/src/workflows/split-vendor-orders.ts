import { acquireLockStep, createRemoteLinkStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import type { CreateOrderDTO, LinkDefinition } from "@medusajs/framework/types"
import VendorProductLink from "../links/vendor-product"
import { commissionFor, commissionSvc, resolveRule } from "../lib/commission"
import { channelOf, isFeeLine } from "../lib/fees"
import { allocate, cents, major } from "../lib/money"
import { planIdsFor } from "../lib/plans"
import { VENDOR_MODULE } from "../modules/vendor"

type Row = Record<string, unknown>
const pick = (o: Row | null | undefined, keys: string[]) =>
  o ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : undefined

const ADDRESS = ["first_name", "last_name", "company", "address_1", "address_2", "city", "country_code", "province", "postal_code", "phone", "metadata"]
const ITEM = [
  "title", "subtitle", "thumbnail", "quantity", "unit_price", "compare_at_unit_price", "is_tax_inclusive", "requires_shipping", "is_discountable",
  "product_id", "product_title", "product_description", "product_subtitle", "product_type", "product_collection", "product_handle",
  "variant_id", "variant_sku", "variant_barcode", "variant_title", "variant_option_values",
]
const TAX = ["description", "tax_rate_id", "code", "rate", "provider_id"]
const ADJ = ["description", "promotion_id", "code", "amount", "provider_id"]
const copyLines = (r: Row) => ({
  tax_lines: ((r.tax_lines ?? []) as Row[]).map((t) => pick(t, TAX)),
  adjustments: ((r.adjustments ?? []) as Row[]).map((a) => pick(a, ADJ)),
})

type Plan = { parent_id: string; orders: { vendor_id: string; input: CreateOrderDTO }[] }

// Groups the parent's items + shipping methods by vendor. Empty plan when already split (idempotent) or on a child order.
const planVendorOrdersStep = createStep("plan-vendor-orders", async ({ order_id }: { order_id: string }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [o],
  } = await query.graph({
    entity: "order",
    fields: [
      "id", "metadata", "created_at", "region_id", "customer_id", "sales_channel_id", "email", "currency_code",
      "shipping_address.*", "billing_address.*",
      "items.*", "items.tax_lines.*", "items.adjustments.*",
      "shipping_methods.*", "shipping_methods.tax_lines.*", "shipping_methods.adjustments.*",
    ],
    filters: { id: order_id },
  })
  const meta = (o.metadata ?? {}) as Row
  if (meta.vendor_order_ids || meta.parent_order_id) return new StepResponse<Plan>({ parent_id: o.id, orders: [] })

  const items = (o.items ?? []) as Row[]
  const { data: links } = await query.graph({
    entity: VendorProductLink.entryPoint,
    fields: ["vendor_id", "product_id"],
    filters: { product_id: items.map((i) => i.product_id as string).filter(Boolean) },
  })
  const vendorOf = new Map(links.map((l: Row) => [l.product_id, l.vendor_id as string]))
  const methods = (o.shipping_methods ?? []) as Row[]
  const options = methods.length
    ? await container
        .resolve(Modules.FULFILLMENT)
        .listShippingOptions({ id: methods.map((m) => m.shipping_option_id as string) }, { select: ["id", "metadata"] })
    : []
  const optionVendor = new Map(options.map((s) => [s.id, s.metadata?.vendor_id as string | undefined]))

  // ponytail: items of vendor-less products (admin-created) stay on the parent only. Managed-inventory reservations
  // are not moved to child lines: vendor products are unmanaged (no stock levels) until stock management lands.
  // Quote orders: free-text lines have no product → vendor from item metadata.
  const vendorFor = (i: Row) => (vendorOf.get(i.product_id) ?? (i.metadata as Row | null)?.vendor_id) as string | undefined
  const vendorIds = [...new Set(items.map(vendorFor).filter(Boolean))] as string[]
  const base = {
    ...pick(o, ["region_id", "customer_id", "sales_channel_id", "email", "currency_code"]),
    status: "pending",
    shipping_address: pick(o.shipping_address as Row, ADDRESS),
    billing_address: pick(o.billing_address as Row, ADDRESS),
  }
  // P4: commission snapshot per line (rule active at placement) + this vendor's pro-rata share of the parent's platform fee.
  const channel = await channelOf(container, o.sales_channel_id as string)
  const rules = await commissionSvc(container).listCommissionRules({})
  const planOf = await planIdsFor(container, vendorIds)
  const { data: products } = await query.graph({
    entity: "product", fields: ["id", "categories.id"], filters: { id: items.map((i) => i.product_id as string).filter(Boolean) },
  })
  const catsOf = new Map((products as Row[]).map((p) => [p.id, ((p.categories ?? []) as Row[]).map((c) => c.id as string)]))
  const at = new Date(o.created_at as string)
  const lineCents = (i: Row) => cents(Number(i.unit_price) * Number(i.quantity))
  const itemsOf = (vendor_id: string) => items.filter((i) => vendorFor(i) === vendor_id)
  const feeShares = allocate(cents(items.filter(isFeeLine).reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0)),
    vendorIds.map((v) => itemsOf(v).reduce((s, i) => s + lineCents(i), 0)))
  const orders = vendorIds.map((vendor_id, k) => {
    const lines = itemsOf(vendor_id).map((i) => {
      const rule = resolveRule(rules as Row[], { vendor_id, plan_id: planOf.get(vendor_id), category_ids: catsOf.get(i.product_id) ?? [], channel, at })
      return { i, commission: commissionFor(rule, lineCents(i)) }
    })
    const commission_total = major(lines.reduce((s, l) => s + cents(l.commission.amount), 0))
    return {
      vendor_id,
      input: {
        ...base,
        metadata: { parent_order_id: o.id, vendor_id, fee_share: major(feeShares[k]), commission_total },
        items: lines.map(({ i, commission }) => ({ ...pick(i, ITEM), ...copyLines(i), metadata: { ...(i.metadata as Row), parent_item_id: i.id, commission } })),
        shipping_methods: methods
          .filter((m) => optionVendor.get(m.shipping_option_id as string) === vendor_id)
          .map((m) => ({ ...pick(m, ["name", "description", "amount", "is_tax_inclusive", "shipping_option_id", "data", "metadata"]), ...copyLines(m) })),
      } as unknown as CreateOrderDTO,
    }
  })
  return new StepResponse<Plan>({ parent_id: o.id, orders })
})

const createVendorOrdersStep = createStep(
  "create-vendor-orders",
  async (plan: Plan, { container }) => {
    if (!plan.orders.length) return new StepResponse([], [])
    const created = await container.resolve(Modules.ORDER).createOrders(plan.orders.map((p) => p.input))
    const out = created.map((c, i) => ({ id: c.id, vendor_id: plan.orders[i].vendor_id }))
    return new StepResponse(out, out.map((c) => c.id))
  },
  async (ids, { container }) => {
    if (ids?.length) await container.resolve(Modules.ORDER).deleteOrders(ids)
  },
)

// Idempotency marker, written last.
const markParentStep = createStep(
  "mark-parent-split",
  async ({ parent_id, ids }: { parent_id: string; ids: string[] }, { container }) => {
    if (!ids.length) return new StepResponse(undefined, null)
    const svc = container.resolve(Modules.ORDER)
    const parent = await svc.retrieveOrder(parent_id, { select: ["id", "metadata"] })
    await svc.updateOrders(parent_id, { metadata: { ...parent.metadata, vendor_order_ids: ids } })
    return new StepResponse(undefined, { parent_id, metadata: parent.metadata ?? null })
  },
  async (prev, { container }) => {
    if (prev) await container.resolve(Modules.ORDER).updateOrders(prev.parent_id, { metadata: prev.metadata })
  },
)

/** Parent order → one child order per vendor, linked to the vendor (status `pending`). Runs from the order.placed subscriber. */
export const splitVendorOrdersWorkflow = createWorkflow("split-vendor-orders", (input: { order_id: string }) => {
  const key = transform(input, (i) => `split-${i.order_id}`)
  acquireLockStep({ key, timeout: 30, ttl: 120 })
  const plan = planVendorOrdersStep(input)
  const created = createVendorOrdersStep(plan)
  createRemoteLinkStep(
    transform({ created }, ({ created }): LinkDefinition[] =>
      created.map((c) => ({ [VENDOR_MODULE]: { vendor_id: c.vendor_id }, [Modules.ORDER]: { order_id: c.id }, data: { status: "pending" } })),
    ),
  )
  markParentStep(transform({ plan, created }, ({ plan, created }) => ({ parent_id: plan.parent_id, ids: created.map((c) => c.id) })))
  releaseLockStep({ key })
  return new WorkflowResponse(created)
})
