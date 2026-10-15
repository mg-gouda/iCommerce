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
  /** P4: commission snapshot + share of the buyer platform fee (collected with COD). */
  commission_total: number
  fee_share: number
  payment: { provider_id: string | null; status: "awaiting" | "paid" | "canceled" }
  fulfillment: { carrier: string | null; tracking_number: string | null; tracking_url: string | null; shipped_at: string | null; delivered_at: string | null } | null
  return_request: ReturnRequest | null
  cancel_reason: string | null
}

export type ShippingOption = { id: string; name: string; kind: "flat" | "free_over" | "pickup"; amount: number; free_over: number | null }

// Shapes from project_docs/api/p3-backend.md §2–3.
export type QuoteStatus = "requested" | "vendor_review" | "offered" | "negotiating" | "pending_approval" | "accepted" | "ordered" | "rejected" | "expired"

export type QuoteItem = {
  id: string
  product_id: string | null
  title: string
  quantity: number
  unit: string | null
  target_price: number | null
  offered_unit_price: number | null
  lead_time_days: number | null
}

export type Quote = {
  id: string
  rfq_id: string
  status: QuoteStatus
  currency_code: string
  company: { id: string; name: string; country: string; city: string | null } | null
  requester: { email: string; first_name: string | null; last_name: string | null } | null
  notes: string | null
  incoterm: string | null
  validity_until: string | null
  total: number | null
  order_id: string | null
  items: QuoteItem[]
  messages?: { id: string; author: "buyer" | "vendor" | "system"; author_name: string | null; body: string; created_at: string }[]
  created_at: string
  updated_at: string
}

export type WholesaleTier = { min_qty: number; unit_price_usd: number }

/** Server-action result: field errors are message keys under `errors.*`, `message` is a raw API message. */
export type FormState = {
  ok?: boolean
  fieldErrors?: Record<string, string>
  message?: string
  values?: Record<string, string>
}

// Shapes from project_docs/api/p4-backend.md §3–4.
export type LedgerType = "sale" | "commission" | "fee_collected" | "refund" | "payout" | "adjustment"
export type LedgerStatus = "pending" | "available" | "paid"
export type LedgerEntry = {
  id: string
  vendor_order_id: string | null
  order_display_id: number | null
  type: LedgerType
  amount: number
  currency_code: string
  status: LedgerStatus
  available_at: string | null
  note: string | null
  created_at: string
}
export type PayoutSummary = { pending: number; available: number; balance: number; owed: number; paid_total: number }
export type PayoutBatch = { id: string; amount: number; status: "open" | "paid"; reference: string | null; paid_at: string | null; entry_count: number; created_at: string }

export type Plan = {
  id: string
  handle: string
  name_en: string
  name_ar: string
  price_usd: number
  interval: "monthly" | "yearly"
  product_limit: number | null
  staff_limit: number | null
  featured_slots: number
  can_b2b: boolean
  analytics_level: "basic" | "full"
}
export type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled"
export type Subscription = {
  id: string | null
  plan: Plan | null
  status: SubscriptionStatus
  current_period_end: string | null
  requested_plan_id: string | null
  read_only: boolean
}
/** `plan` on GET /vendors/me (banners). */
export type PlanState = {
  handle: string | null; name_en: string | null; name_ar: string | null; status: SubscriptionStatus
  current_period_end: string | null; read_only: boolean; past_due: boolean; can_b2b: boolean
}
