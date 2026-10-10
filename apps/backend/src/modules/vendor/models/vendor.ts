import { model } from "@medusajs/framework/utils"

const Vendor = model.define("vendor", {
  id: model.id({ prefix: "ven" }).primaryKey(),
  name: model.text(),
  handle: model.text().unique(),
  status: model.enum(["pending", "approved", "suspended"]).default("pending"),
})

export default Vendor
