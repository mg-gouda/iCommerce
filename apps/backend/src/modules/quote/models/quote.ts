import { model } from "@medusajs/framework/utils"

// routing/routed: free-text lines the buyer left to iCommerce (no vendor yet); staff route them to vendors.
export const QUOTE_STATUSES = [
  "routing", "routed", "requested", "vendor_review", "offered", "negotiating", "pending_approval", "accepted", "ordered", "rejected", "expired",
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

// Ids from other modules (company, member, customer, vendor, order) are plain columns: quotes are always read by them.
export const Quote = model.define("quote", {
  id: model.id({ prefix: "quo" }).primaryKey(),
  rfq_id: model.text().index(),
  company_id: model.text().index(),
  requester_id: model.text(),
  customer_id: model.text(),
  vendor_id: model.text().index().nullable(), // null while routing / routed
  status: model.enum([...QUOTE_STATUSES]).default("requested"),
  currency_code: model.text().default("usd"),
  validity_until: model.dateTime().nullable(),
  incoterm: model.text().nullable(),
  notes: model.text().nullable(),
  total: model.bigNumber().nullable(),
  order_id: model.text().nullable(),
  approved_by: model.text().nullable(),
  items: model.hasMany(() => QuoteItem, { mappedBy: "quote" }),
  messages: model.hasMany(() => QuoteMessage, { mappedBy: "quote" }),
})

export const QuoteItem = model.define("quote_item", {
  id: model.id({ prefix: "quoitm" }).primaryKey(),
  product_id: model.text().nullable(),
  variant_id: model.text().nullable(),
  title: model.text(),
  quantity: model.bigNumber(),
  unit: model.text().nullable(),
  target_price: model.bigNumber().nullable(),
  offered_unit_price: model.bigNumber().nullable(),
  lead_time_days: model.number().nullable(),
  quote: model.belongsTo(() => Quote, { mappedBy: "items" }),
})

export const QuoteMessage = model.define("quote_message", {
  id: model.id({ prefix: "quomsg" }).primaryKey(),
  author: model.enum(["buyer", "vendor", "system", "platform"]), // platform = iCommerce staff
  author_name: model.text().nullable(),
  body: model.text(),
  quote: model.belongsTo(() => Quote, { mappedBy: "messages" }),
})
