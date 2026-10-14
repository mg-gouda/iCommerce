import { model } from "@medusajs/framework/utils"

export const LEDGER_TYPES = ["sale", "commission", "fee_collected", "refund", "payout", "adjustment"] as const
export const LEDGER_STATUSES = ["pending", "available", "paid"] as const

// amount is signed from the vendor's side: Σ amount = what the platform owes the vendor (negative = vendor owes).
export const LedgerEntry = model.define("ledger_entry", {
  id: model.id({ prefix: "ledg" }).primaryKey(),
  vendor_id: model.text().index(),
  vendor_order_id: model.text().index().nullable(),
  order_display_id: model.number().nullable(),
  type: model.enum([...LEDGER_TYPES]),
  amount: model.bigNumber(),
  currency_code: model.text().default("usd"),
  status: model.enum([...LEDGER_STATUSES]).default("pending"),
  available_at: model.dateTime().nullable(),
  batch_id: model.text().index().nullable(),
  note: model.text().nullable(),
})

export const PayoutBatch = model.define("payout_batch", {
  id: model.id({ prefix: "pbat" }).primaryKey(),
  vendor_id: model.text().index(),
  amount: model.bigNumber(),
  currency_code: model.text().default("usd"),
  status: model.enum(["open", "paid"]).default("open"),
  reference: model.text().nullable(),
  paid_at: model.dateTime().nullable(),
})
