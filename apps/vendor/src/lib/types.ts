// Shapes from project_docs/api/p1-backend.md (only the fields the portal reads).
export type Vendor = {
  id: string
  name: string
  handle: string
  status: "pending" | "approved" | "suspended"
  logo: string | null
  banner: string | null
  description: string | null
  phone: string | null
  email: string | null
  country: string | null
  city: string | null
  tax_id: string | null
  commercial_reg_no: string | null
  export_card_no: string | null
  kyc_status: "none" | "submitted" | "verified" | "rejected"
  kyc_note: string | null
  kyc_files: { id: string; filename: string; mime_type: string }[] | null
}

export type VendorUser = { id: string; email: string; first_name: string | null; role: "owner" | "staff" }

export type ProductStatus = "draft" | "proposed" | "published" | "rejected"

export type ProductExtra = {
  unit: string | null
  min_qty: number | null
  max_qty: number | null
  qty_step: number | null
  hs_code: string | null
  cost_price: number | null
  b2b_only: boolean
  b2c_enabled: boolean
}

export type VendorProduct = {
  id: string
  title: string
  handle: string
  description: string | null
  status: ProductStatus
  thumbnail: string | null
  metadata: Record<string, unknown> | null
  updated_at: string
  images: { id: string; url: string }[]
  categories: { id: string; name: string; handle: string }[]
  variants: { id: string; prices: { currency_code: string; amount: number }[] }[]
  product_extra: ProductExtra | null
}

// Shapes from project_docs/api/p2-backend.md §6.
export type OrderStatus = "pending" | "shipped" | "delivered" | "canceled"

export type ReturnRequest = {
  status: "requested" | "approved" | "rejected"
  reason: string
  items: { item_id: string; quantity: number }[]
  note: string | null
  requested_at: string
  decided_at: string | null
}

type AddressKey = "first_name" | "last_name" | "company" | "address_1" | "address_2" | "city" | "province" | "postal_code" | "country_code" | "phone"

export type VendorOrder = {
  id: string
  display_id: number
  status: OrderStatus
  created_at: string
  currency_code: string
  email: string | null
  buyer: { first_name: string | null; last_name: string | null }
  shipping_address: Record<AddressKey, string | null>
  items: { id: string; title: string; variant_title: string | null; thumbnail: string | null; quantity: number; unit_price: number; total: number }[]
  shipping_method: { name: string; amount: number } | null
  item_total: number
  shipping_total: number
  tax_total: number
  total: number
  payment: { provider_id: string | null; status: "awaiting" | "paid" | "canceled" }
  fulfillment: { carrier: string | null; tracking_number: string | null; tracking_url: string | null; shipped_at: string | null; delivered_at: string | null } | null
  return_request: ReturnRequest | null
  cancel_reason: string | null
}

export type ShippingOption = { id: string; name: string; kind: "flat" | "free_over" | "pickup"; amount: number; free_over: number | null }

/** Server-action result: field errors are message keys under `errors.*`, `message` is a raw API message. */
export type FormState = {
  ok?: boolean
  fieldErrors?: Record<string, string>
  message?: string
  values?: Record<string, string>
}
