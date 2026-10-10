import { model } from "@medusajs/framework/utils"
import Vendor from "./vendor"

const VendorUser = model.define("vendor_user", {
  id: model.id({ prefix: "venusr" }).primaryKey(),
  email: model.text().unique(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  role: model.enum(["owner", "staff"]).default("owner"),
  vendor: model.belongsTo(() => Vendor, { mappedBy: "users" }),
})

export default VendorUser
