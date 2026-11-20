import { model } from "@medusajs/framework/utils"

export const REP_TYPES = ["branch_manager", "account_manager", "broker"] as const
export const TARGET_TYPES = ["company", "customer", "vendor"] as const

export const Branch = model.define("sales_branch", {
  id: model.id({ prefix: "sbr" }).primaryKey(),
  code: model.text().unique(),
  name: model.text().searchable(),
  legacy_id: model.text().unique().nullable(),
})

// manager_id (account manager / broker) → a branch manager; a branch manager's branch_id gives the branch.
export const SalesRep = model
  .define("sales_rep", {
    id: model.id({ prefix: "srep" }).primaryKey(),
    type: model.enum([...REP_TYPES]),
    code: model.text().searchable(),
    name: model.text().searchable(),
    email: model.text().nullable(),
    branch_id: model.text().index().nullable(),
    manager_id: model.text().index().nullable(),
    legacy_id: model.text().nullable(),
    active: model.boolean().default(true),
  })
  .indexes([
    { on: ["type", "code"], unique: true },
    { on: ["type", "legacy_id"], unique: true, where: "legacy_id IS NOT NULL" },
  ])

// Stored complete: missing tree fields are derived at write time (lib/sales-org.ts).
export const Assignment = model
  .define("sales_assignment", {
    id: model.id({ prefix: "sasg" }).primaryKey(),
    target_type: model.enum([...TARGET_TYPES]),
    target_id: model.text(),
    branch_id: model.text().index().nullable(),
    branch_manager_id: model.text().index().nullable(),
    account_manager_id: model.text().index().nullable(),
    broker_id: model.text().index().nullable(),
  })
  .indexes([{ on: ["target_type", "target_id"], unique: true }])

// Report facts: one row per line of a non-canceled vendor child order. Written/read with raw SQL (lib/reports.ts).
export const ReportLine = model.define("report_line", {
  id: model.id({ prefix: "rline" }).primaryKey(),
  order_id: model.text().index(),
  parent_order_id: model.text(),
  vendor_id: model.text().index(),
  day: model.text().index(), // UTC YYYY-MM-DD of the parent's created_at
  channel: model.enum(["b2b", "b2c"]),
  product_id: model.text().nullable(),
  variant_id: model.text().nullable(),
  category_id: model.text().nullable(),
  country_code: model.text().nullable(),
  customer_id: model.text().nullable(),
  company_id: model.text().nullable(),
  buyer_label: model.text(),
  quantity: model.bigNumber(),
  gross: model.bigNumber(),
  commission: model.bigNumber(),
  fee_share: model.bigNumber(),
  paid: model.boolean().default(false),
  branch_id: model.text().nullable(),
  branch_manager_id: model.text().nullable(),
  account_manager_id: model.text().nullable(),
  broker_id: model.text().nullable(),
})
