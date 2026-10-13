import { model } from "@medusajs/framework/utils"
import Company from "./company"

// ponytail: customer_id is a plain column (one company per customer), not a module link; nothing queries through it.
const CompanyMember = model.define("company_member", {
  id: model.id({ prefix: "cmem" }).primaryKey(),
  customer_id: model.text().unique(),
  email: model.text(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  role: model.enum(["admin", "buyer", "approver"]).default("buyer"),
  company: model.belongsTo(() => Company, { mappedBy: "members" }),
})

export default CompanyMember
