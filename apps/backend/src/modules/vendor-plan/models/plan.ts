import { model } from "@medusajs/framework/utils"

export const Plan = model.define("plan", {
  id: model.id({ prefix: "plan" }).primaryKey(),
  handle: model.text().unique(),
  name_en: model.text(),
  name_ar: model.text(),
  price_usd: model.bigNumber().default(0),
  interval: model.enum(["monthly", "yearly"]).default("monthly"),
  product_limit: model.number().nullable(), // null = unlimited
  staff_limit: model.number().nullable(),
  featured_slots: model.number().default(0),
  can_b2b: model.boolean().default(false),
  analytics_level: model.enum(["basic", "full"]).default("basic"),
  active: model.boolean().default(true),
  subscriptions: model.hasMany(() => VendorSubscription, { mappedBy: "plan" }),
})

// One row per vendor; no row = Starter (lib/plans.ts).
export const VendorSubscription = model.define("vendor_subscription", {
  id: model.id({ prefix: "vsub" }).primaryKey(),
  vendor_id: model.text().unique(),
  status: model.enum(["trial", "active", "past_due", "cancelled"]).default("active"),
  current_period_start: model.dateTime().nullable(),
  current_period_end: model.dateTime().nullable(),
  requested_plan_id: model.text().nullable(),
  plan: model.belongsTo(() => Plan, { mappedBy: "subscriptions" }),
})
