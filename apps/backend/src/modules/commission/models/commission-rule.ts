import { model } from "@medusajs/framework/utils"

export const COMMISSION_SCOPES = ["global", "plan", "category", "vendor", "vendor_category"] as const

// scope_id: plan id | category id | vendor id | "<vendor_id>:<category_id>" | null (global). Resolution in lib/commission.ts.
const CommissionRule = model.define("commission_rule", {
  id: model.id({ prefix: "comrule" }).primaryKey(),
  scope: model.enum([...COMMISSION_SCOPES]),
  scope_id: model.text().index().nullable(),
  channel: model.enum(["b2c", "b2b", "all"]).default("all"),
  percent: model.bigNumber().default(0),
  fixed_amount: model.bigNumber().default(0),
  min: model.bigNumber().nullable(),
  max: model.bigNumber().nullable(),
  active_from: model.dateTime().nullable(),
  active_to: model.dateTime().nullable(),
  note: model.text().nullable(),
})

export default CommissionRule
