import { model } from "@medusajs/framework/utils"
import Company from "./company"

const CompanyInvitation = model.define("company_invitation", {
  id: model.id({ prefix: "cinv" }).primaryKey(),
  email: model.text(),
  role: model.enum(["admin", "buyer", "approver"]).default("buyer"),
  token: model.text().unique(),
  expires_at: model.dateTime(),
  accepted_at: model.dateTime().nullable(),
  company: model.belongsTo(() => Company, { mappedBy: "invitations" }),
})

export default CompanyInvitation
