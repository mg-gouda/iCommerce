// Shapes from project_docs/api/p3-backend.md. Contract changes land here + in api.ts only.

export type KycStatus = "none" | "submitted" | "verified" | "rejected"
export type Role = "admin" | "buyer" | "approver"
export const ROLES: Role[] = ["admin", "buyer", "approver"]

export type Company = {
  id: string
  name: string
  handle: string
  country: string
  city: string | null
  address: string | null
  phone: string | null
  tax_id: string | null
  commercial_reg_no: string | null
  export_card_no: string | null
  kyc_status: KycStatus
  kyc_note: string | null
  kyc_files: { id: string; filename: string; mime_type: string }[] | null
  verified_at: string | null
  payment_mode: "upfront" | "net_terms"
}
export type Member = { id: string; customer_id: string; email: string; first_name: string | null; last_name: string | null; role: Role; created_at: string }
export type Invitation = { id: string; email: string; role: Role; expires_at: string; accepted_at: string | null; created_at: string }
export type Membership = { company: Company; member: Member }

export type Tier = { min_qty: number; unit_price_usd: number }

export type QuoteStatus =
  | "routing" | "routed" | "requested" | "vendor_review" | "offered" | "negotiating" | "pending_approval"
  | "accepted" | "ordered" | "rejected" | "expired"
export type QuoteItem = {
  id: string
  product_id: string | null
  variant_id: string | null
  title: string
  quantity: number
  unit: string | null
  target_price: number | null
  offered_unit_price: number | null
  lead_time_days: number | null
}
export type QuoteMessage = { id: string; author: "buyer" | "vendor" | "system" | "platform"; author_name: string | null; body: string; created_at: string }
export type Quote = {
  id: string
  rfq_id: string
  status: QuoteStatus
  currency_code: string
  vendor: { id: string; name: string; handle: string } | null // null = iCommerce finding suppliers (routing / routed)
  requester: { id: string; email: string; first_name: string | null; last_name: string | null }
  notes: string | null
  incoterm: string | null
  validity_until: string | null
  total: number | null
  order_id: string | null
  approved_by: string | null
  items: QuoteItem[]
  messages?: QuoteMessage[]
  created_at: string
}

export type CreditAccount = { id: string; company_id: string; limit_usd: number; terms_days: number; status: "active" | "on_hold" }
export type Invoice = {
  id: string
  order_id: string
  display_id: number
  amount: number
  currency_code: string
  due_date: string
  status: "open" | "paid" | "overdue"
  paid_at: string | null
  created_at: string
}
export type Credit = { credit_account: CreditAccount | null; used: number; available: number; invoices: Invoice[] }

/** RFQ line before submit: catalog product or free text (vendor picked on the review page). */
export type DraftItem = { product_id?: string; title?: string; quantity: number; unit?: string }
