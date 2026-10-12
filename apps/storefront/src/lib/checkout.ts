import { sdk } from "@icommerce/sdk"
import { auth, status, type Order } from "./session"

export type ShipOption = { id: string; name: string; amount: number; kind: "flat" | "free_over" | "pickup"; free_over: number | null }
export type ShipGroup = {
  profileId: string
  vendor: { id: string; name: string; handle: string } | null
  selected: string | null
  options: ShipOption[]
}

type VendorGroupsRes = {
  vendor_groups: {
    vendor: { id: string; name: string; handle: string }
    shipping_profile_id: string
    selected_option_id: string | null
    shipping_options: ShipOption[]
  }[]
}

/** One shipping method per vendor: `GET /store/carts/:id/vendor-groups` (p2-backend.md §2). */
export async function shippingGroups(cartId: string): Promise<ShipGroup[]> {
  const headers = await auth()
  try {
    const { vendor_groups } = await sdk.client.fetch<VendorGroupsRes>(`/store/carts/${cartId}/vendor-groups`, { headers })
    return vendor_groups.map((g) => ({
      profileId: g.shipping_profile_id,
      vendor: g.vendor,
      selected: g.selected_option_id,
      options: [...g.shipping_options].sort((a, b) => a.amount - b.amount),
    }))
  } catch (e) {
    if (status(e) !== 404) throw e
  }
  // ponytail: P1 backend (no vendor-groups route yet) → standard options grouped by profile, vendor from option metadata/data.
  // Delete once the P2 backend is merged.
  const [{ shipping_options }, { cart }] = await Promise.all([
    sdk.store.fulfillment.listCartOptions({ cart_id: cartId, fields: "+data,+metadata" } as never, headers),
    sdk.store.cart.retrieve(cartId, { fields: "shipping_methods.shipping_option_id" }, headers),
  ])
  const picked = new Set((cart.shipping_methods ?? []).map((m) => m.shipping_option_id))
  const groups = new Map<string, ShipGroup>()
  for (const o of shipping_options) {
    const x = o as { data?: object | null; metadata?: object | null }
    const m = { ...x.data, ...x.metadata } as Record<string, string | undefined>
    const g = groups.get(o.shipping_profile_id) ?? {
      profileId: o.shipping_profile_id,
      vendor: m.vendor_id ? { id: m.vendor_id, name: m.vendor_name ?? "", handle: m.vendor_handle ?? "" } : null,
      selected: null,
      options: [],
    }
    g.options.push({ id: o.id, name: o.name, amount: o.amount ?? 0, kind: "flat", free_over: null })
    if (picked.has(o.id)) g.selected = o.id
    groups.set(o.shipping_profile_id, g)
  }
  return [...groups.values()].map((g) => ({ ...g, options: g.options.sort((a, b) => a.amount - b.amount) }))
}

/** `pp_cod_cod` / `pp_bank-transfer_bank-transfer` (p2-backend.md §3). */
export function payKind(providerId: string): "cod" | "bank" | "other" {
  if (providerId === "pp_bank-transfer_bank-transfer") return "bank"
  // ponytail: P1 region only has Medusa's manual `pp_system_default` → shown as COD until the P2 backend is merged.
  if (providerId === "pp_cod_cod" || providerId === "pp_system_default") return "cod"
  return "other"
}

export async function paymentProviders(regionId: string) {
  const { payment_providers } = await sdk.store.payment.listPaymentProviders({ region_id: regionId })
  const ids = payment_providers.map((p) => p.id)
  // The manual fallback only counts when no real COD/bank provider is configured.
  const real = ids.filter((id) => id !== "pp_system_default" && payKind(id) !== "other")
  return real.length ? real : ids.filter((id) => payKind(id) !== "other")
}

const ORDER_FIELDS = [
  "id", "display_id", "email", "status", "created_at", "currency_code", "total", "item_subtotal", "shipping_total", "metadata",
  "*items", "*shipping_address", "*shipping_methods", "*payment_collections", "*payment_collections.payment_sessions",
].join(",")

export async function getOrder(id: string) {
  return (await sdk.store.order.retrieve(id, { fields: ORDER_FIELDS }, await auth())).order
}

/** Payment kind + bank-transfer instructions (`data.bank_details`, free text) from the order's payment session. */
export function orderPayment(order: Order) {
  const s = order.payment_collections?.[0]?.payment_sessions?.[0]
  const bank = (s?.data as { bank_details?: string } | undefined)?.bank_details ?? null
  return { kind: s ? payKind(s.provider_id) : "other", bank }
}

export type VendorOrder = {
  id: string
  display_id: number
  status: "pending" | "shipped" | "delivered" | "canceled"
  vendor: { id: string; name: string; handle: string }
  items: { id: string; parent_item_id: string; title: string; quantity: number; unit_price: number }[]
  shipping_method: { name: string; amount: number } | null
  total: number
  fulfillment: { carrier: string; tracking_number: string; tracking_url: string | null; shipped_at: string; delivered_at: string | null } | null
  return_request: { status: "requested" | "approved" | "rejected"; reason: string; note: string | null } | null
}
export type VendorOrders = {
  vendor_orders: VendorOrder[]
  payment: { provider_id: string; status: string; bank_details: string | null; proof_uploaded_at: string | null }
}

/** Per-vendor progress (customer's own orders only). null = not available (guest, or P1 backend). */
export async function vendorOrders(orderId: string): Promise<VendorOrders | null> {
  try {
    return await sdk.client.fetch<VendorOrders>(`/store/orders/${orderId}/vendor-orders`, { headers: await auth() })
  } catch (e) {
    if ([401, 404].includes(status(e) ?? 0)) return null
    throw e
  }
}
