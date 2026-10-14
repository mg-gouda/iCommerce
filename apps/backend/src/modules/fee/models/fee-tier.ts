import { model } from "@medusajs/framework/utils"

// Platform buyer fee tier, per channel. Floor lookup: highest min_amount ≤ base (see lib/fees.ts).
const FeeTier = model.define("fee_tier", {
  id: model.id({ prefix: "fee" }).primaryKey(),
  channel: model.enum(["b2b", "b2c"]),
  basis: model.enum(["monthly_volume", "order_total"]),
  min_amount: model.bigNumber().default(0),
  percent: model.bigNumber().default(0),
  fixed_amount: model.bigNumber().default(0),
  min_fee: model.bigNumber().nullable(),
  max_fee: model.bigNumber().nullable(),
  currency: model.text().default("usd"),
  active_from: model.dateTime().nullable(),
  active_to: model.dateTime().nullable(),
  label_en: model.text(),
  label_ar: model.text(),
})

export default FeeTier
