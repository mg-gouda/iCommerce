import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import VendorOrderLink from "../links/vendor-order"
import { VENDOR_MODULE } from "../modules/vendor"

export type VendorOrderStatus = "pending" | "shipped" | "delivered" | "canceled"
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export const ORDER_FIELDS = [
  "id", "display_id", "status", "created_at", "currency_code", "email", "metadata",
  "shipping_address.*",
  "items.id", "items.title", "items.variant_title", "items.thumbnail", "items.quantity", "items.unit_price", "items.total", "items.metadata",
  "shipping_methods.name", "shipping_methods.amount",
  "item_total", "shipping_total", "tax_total", "total",
  "fulfillments.id", "fulfillments.shipped_at", "fulfillments.delivered_at", "fulfillments.canceled_at", "fulfillments.metadata",
  "fulfillments.labels.tracking_number", "fulfillments.labels.tracking_url",
]
const ADDRESS = ["first_name", "last_name", "company", "address_1", "address_2", "city", "province", "postal_code", "country_code", "phone"]

const query = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.QUERY)

/** Payment row(s) of parent orders: provider + amounts. */
export async function parentPayments(scope: MedusaContainer, parentIds: string[]) {
  if (!parentIds.length) return new Map<string, Row>()
  const { data } = await query(scope).graph({
    entity: "order",
    fields: [
      "id", "display_id", "status", "customer_id", "email", "metadata", "customer.metadata",
      "payment_collections.payments.id", "payment_collections.payments.provider_id", "payment_collections.payments.amount",
      "payment_collections.payments.captured_at", "payment_collections.payments.canceled_at", "payment_collections.payments.captures.amount",
    ],
    filters: { id: parentIds },
  })
  return new Map<string, Row>(data.map((o: Row) => [o.id, { ...o, payment: o.payment_collections?.flatMap((c: Row) => c.payments ?? [])[0] }]))
}

export function shapeVendorOrder(o: Row, status: VendorOrderStatus, provider_id?: string | null) {
  const f = ((o.fulfillments ?? []) as Row[]).filter((x) => !x.canceled_at).at(-1)
  const a = o.shipping_address ?? {}
  return {
    id: o.id,
    display_id: o.display_id,
    status,
    created_at: o.created_at,
    currency_code: o.currency_code,
    email: o.email,
    parent_order_id: o.metadata?.parent_order_id ?? null,
    vendor_id: o.metadata?.vendor_id as string,
    buyer: { first_name: a.first_name ?? null, last_name: a.last_name ?? null },
    shipping_address: Object.fromEntries(ADDRESS.map((k) => [k, a[k] ?? null])),
    items: ((o.items ?? []) as Row[]).map((i) => ({
      id: i.id, parent_item_id: i.metadata?.parent_item_id ?? null, title: i.title, variant_title: i.variant_title,
      thumbnail: i.thumbnail, quantity: i.quantity, unit_price: i.unit_price, total: i.total,
      commission: Number(i.metadata?.commission?.amount ?? 0),
    })),
    shipping_method: o.shipping_methods?.[0] ? { name: o.shipping_methods[0].name, amount: o.shipping_methods[0].amount } : null,
    item_total: o.item_total,
    shipping_total: o.shipping_total,
    tax_total: o.tax_total,
    total: o.total,
    // P4: platform commission (snapshot) + this order's share of the buyer's platform fee (COD: collected with the order).
    commission_total: Number(o.metadata?.commission_total ?? 0),
    fee_share: Number(o.metadata?.fee_share ?? 0),
    payment: {
      provider_id: provider_id ?? null,
      status: status === "canceled" ? "canceled" : o.metadata?.paid_at ? "paid" : "awaiting",
    },
    fulfillment: f
      ? {
          id: f.id as string,
          carrier: f.metadata?.carrier ?? null,
          tracking_number: f.labels?.[0]?.tracking_number ?? null,
          tracking_url: f.labels?.[0]?.tracking_url || null,
          shipped_at: f.shipped_at ?? null,
          delivered_at: f.delivered_at ?? null,
        }
      : null,
    return_request: o.metadata?.return_request ?? null,
    cancel_reason: o.metadata?.cancel_reason ?? null,
  }
}
export type VendorOrder = ReturnType<typeof shapeVendorOrder>

/** Child orders by id, shaped, in the given id order. `statuses` = link status per order id. */
export async function loadVendorOrders(scope: MedusaContainer, ids: string[], statuses: Map<string, VendorOrderStatus>) {
  if (!ids.length) return []
  const { data } = await query(scope).graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: ids } })
  const parents = await parentPayments(scope, [...new Set(data.map((o: Row) => o.metadata?.parent_order_id).filter(Boolean))] as string[])
  const byId = new Map(data.map((o: Row) => [o.id, o]))
  return ids
    .filter((id) => byId.has(id))
    .map((id) => {
      const o = byId.get(id)!
      return shapeVendorOrder(o, statuses.get(id) ?? "pending", parents.get(o.metadata?.parent_order_id)?.payment?.provider_id)
    })
}

/** Link rows for a vendor (optionally one order / one status). */
export async function vendorOrderLinks(scope: MedusaContainer, filters: { vendor_id?: string; order_id?: string | string[]; status?: string }) {
  const { data } = await query(scope).graph({ entity: VendorOrderLink.entryPoint, fields: ["vendor_id", "order_id", "status"], filters })
  return data as { vendor_id: string; order_id: string; status: VendorOrderStatus }[]
}

/** Isolation: another vendor's order is indistinguishable from a missing one. */
export async function getVendorOrderOr404(scope: MedusaContainer, vendor_id: string, order_id: string) {
  const [link] = await vendorOrderLinks(scope, { vendor_id, order_id })
  if (!link) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id "${order_id}" not found`)
  const [order] = await loadVendorOrders(scope, [order_id], new Map([[order_id, link.status]]))
  return order
}

export async function setVendorOrderStatus(scope: MedusaContainer, vendor_id: string, order_id: string, status: VendorOrderStatus) {
  await scope.resolve(ContainerRegistrationKeys.LINK).create({
    [VENDOR_MODULE]: { vendor_id },
    [Modules.ORDER]: { order_id },
    data: { status },
  })
}

export async function patchOrderMetadata(scope: MedusaContainer, id: string, patch: Row) {
  const svc = scope.resolve(Modules.ORDER)
  const o = await svc.retrieveOrder(id, { select: ["id", "metadata"] })
  await svc.updateOrders(id, { metadata: { ...o.metadata, ...patch } })
}

/**
 * After a vendor cancels its part: money already captured (bank transfer confirmed) → `refund_required` on the parent
 * for admin; every vendor order canceled → the parent is canceled too (authorization voided via cancelOrderWorkflow).
 */
export async function afterVendorCancel(scope: MedusaContainer, parentId: string) {
  const parent = (await parentPayments(scope, [parentId])).get(parentId)
  if (!parent || parent.status === "canceled") return
  const captured = (parent.payment?.captures ?? []).length > 0
  if (captured) await patchOrderMetadata(scope, parentId, { refund_required: true })
  const ids = (parent.metadata?.vendor_order_ids ?? []) as string[]
  const links = ids.length ? await vendorOrderLinks(scope, { order_id: ids }) : []
  if (!ids.length || links.length < ids.length || links.some((l) => l.status !== "canceled")) return
  // ponytail: captured money stays captured (refund is manual); cancelOrderWorkflow would record an automatic refund → plain cancel.
  if (captured) await scope.resolve(Modules.ORDER).cancel(parentId)
  else await cancelOrderWorkflow(scope).run({ input: { order_id: parentId } })
}
