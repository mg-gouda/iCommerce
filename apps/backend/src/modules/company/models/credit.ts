import { model } from "@medusajs/framework/utils"

// Net terms. One account per company; one invoice per net-terms order.
export const CreditAccount = model.define("credit_account", {
  id: model.id({ prefix: "cred" }).primaryKey(),
  company_id: model.text().unique(),
  limit_usd: model.bigNumber(),
  terms_days: model.number().default(30),
  status: model.enum(["active", "on_hold"]).default("active"),
})

export const Invoice = model.define("invoice", {
  id: model.id({ prefix: "inv" }).primaryKey(),
  company_id: model.text().index(),
  order_id: model.text().unique(),
  display_id: model.number().nullable(),
  amount: model.bigNumber(),
  currency_code: model.text().default("usd"),
  due_date: model.dateTime(),
  status: model.enum(["open", "paid", "overdue"]).default("open"),
  paid_at: model.dateTime().nullable(),
})
