import { model } from "@medusajs/framework/utils"
import CompanyInvitation from "./company-invitation"
import CompanyMember from "./company-member"

const Company = model.define("company", {
  id: model.id({ prefix: "comp" }).primaryKey(),
  name: model.text().searchable(),
  handle: model.text().unique(),
  country: model.text(),
  city: model.text().nullable(),
  address: model.text().nullable(),
  phone: model.text().nullable(),
  tax_id: model.text().nullable(),
  commercial_reg_no: model.text().nullable(),
  export_card_no: model.text().nullable(),
  kyc_status: model.enum(["none", "submitted", "verified", "rejected"]).default("none"),
  kyc_note: model.text().nullable(),
  // File module ids of private KYC docs. Never exposed as URLs.
  kyc_files: model.json().nullable(),
  verified_at: model.dateTime().nullable(),
  payment_mode: model.enum(["upfront", "net_terms"]).default("upfront"),
  members: model.hasMany(() => CompanyMember, { mappedBy: "company" }),
  invitations: model.hasMany(() => CompanyInvitation, { mappedBy: "company" }),
})

export default Company
