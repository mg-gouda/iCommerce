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
  const { vendor_groups } = await sdk.client.fetch<VendorGroupsRes>(`/store/carts/${cartId}/vendor-groups`, { headers: await auth() })
  return vendor_groups.map((g) => ({
    profileId: g.shipping_profile_id,
    vendor: g.vendor,
    selected: g.selected_option_id,
    options: [...g.shipping_options].sort((a, b) => a.amount - b.amount),
  }))
}

export type PayKind = "cod" | "bank" | "net"
const KINDS: Record<string, PayKind> = { pp_cod_cod: "cod", "pp_bank-transfer_bank-transfer": "bank", "pp_net-terms_net-terms": "net" }
/** COD / bank transfer (p2-backend.md §3) / net terms (p3-backend.md §4) by Medusa provider id; others aren't offered. */
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
