import { model } from "@medusajs/framework/utils"

const ProductExtra = model.define("product_extra", {
  id: model.id({ prefix: "pext" }).primaryKey(),
  unit: model.text().nullable(),
  min_qty: model.bigNumber().nullable(),
  max_qty: model.bigNumber().nullable(),
  qty_step: model.bigNumber().nullable(),
  hs_code: model.text().nullable(),
  cost_price: model.bigNumber().nullable(),
  b2b_only: model.boolean().default(false),
  b2c_enabled: model.boolean().default(true),
  origin_country: model.text().default("EG"),
  legacy_id: model.text().unique().nullable(),
})

export default ProductExtra
