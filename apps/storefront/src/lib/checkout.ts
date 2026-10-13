import { sdk } from "@icommerce/sdk"
import { auth, clientIp, status, type Order } from "./session"

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
  const { vendor_groups } = await sdk.client.fetch<VendorGroupsRes>(`/store/carts/${cartId}/vendor-groups`, { headers: await auth() })
  return vendor_groups.map((g) => ({
    profileId: g.shipping_profile_id,
    vendor: g.vendor,
    selected: g.selected_option_id,
    options: [...g.shipping_options].sort((a, b) => a.amount - b.amount),
  }))
}

export type PayKind = "cod" | "bank"
const KINDS: Record<string, PayKind> = { pp_cod_cod: "cod", "pp_bank-transfer_bank-transfer": "bank" }
/** COD / bank transfer by Medusa provider id (p2-backend.md §3); other providers aren't offered. */
export const payKind = (providerId: string): PayKind | undefined => KINDS[providerId]

export async function paymentProviders(regionId: string) {
  const { payment_providers } = await sdk.store.payment.listPaymentProviders({ region_id: regionId })
  return payment_providers.map((p) => p.id).filter((id) => payKind(id))
}

const ORDER_FIELDS = [
  "id", "display_id", "email", "status", "created_at", "currency_code", "total", "item_subtotal", "shipping_total",
  "*items", "*shipping_address", "*shipping_methods", "*payment_collections", "*payment_collections.payment_sessions",
].join(",")

export async function getOrder(id: string) {
  return (await sdk.store.order.retrieve(id, { fields: ORDER_FIELDS }, await auth())).order
}

/** Payment kind + bank-transfer instructions (`data.bank_details`, free text) from the order's payment session. */
export function orderPayment(order: Order) {
  const s = order.payment_collections?.[0]?.payment_sessions?.[0]
  const bank = (s?.data as { bank_details?: string } | undefined)?.bank_details ?? null
  return { kind: s ? payKind(s.provider_id) : undefined, bank }
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
  cancel_reason: string | null
}
export type OrderPay = { provider_id: string; status: "authorized" | "captured" | "partially_captured" | "canceled"; bank_details: string | null; proof_uploaded_at: string | null }
export type OrderStatus = {
  order: { display_id: number; created_at: string; currency_code: string; total: number }
  vendor_orders: VendorOrder[]
  payment: OrderPay | null
}

/**
 * Per-vendor progress by order number + email (`GET /store/orders/guest-status`, p2-backend.md §4) — guests and
 * signed-in buyers alike. Throws on 404 (no match) / 429 (rate-limited); callers decide.
 */
export async function orderStatus(n: number | string, email: string) {
  // Own signal = opt out of Next's per-render fetch memoization (the confirmation page re-polls while the split runs).
  return sdk.client.fetch<OrderStatus>("/store/orders/guest-status", {
    query: { display_id: n, email },
    headers: await clientIp(),
    signal: new AbortController().signal,
  })
}

/** Same, null when unavailable (no match, rate-limited). */
export const orderStatusOrNull = (n: number | string, email: string) =>
  orderStatus(n, email).catch((e) => {
    if ([404, 429].includes(status(e) ?? 0)) return null
    throw e
  })
