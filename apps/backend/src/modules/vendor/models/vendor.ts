import { model } from "@medusajs/framework/utils"
import VendorUser from "./vendor-user"

const Vendor = model.define("vendor", {
  id: model.id({ prefix: "ven" }).primaryKey(),
  name: model.text().searchable(),
  handle: model.text().unique(),
  status: model.enum(["pending", "approved", "suspended"]).default("pending"),
  logo: model.text().nullable(),
  banner: model.text().nullable(),
  description: model.text().nullable(),
  phone: model.text().nullable(),
  email: model.text().nullable(),
  country: model.text().nullable(),
  city: model.text().nullable(),
  tax_id: model.text().nullable(),
  commercial_reg_no: model.text().nullable(),
  export_card_no: model.text().nullable(),
  kyc_status: model.enum(["none", "submitted", "verified", "rejected"]).default("none"),
  kyc_note: model.text().nullable(),
  // File module ids of private KYC docs. Never exposed as URLs.
  kyc_files: model.json().nullable(),
  legacy_id: model.text().unique().nullable(),
  users: model.hasMany(() => VendorUser, { mappedBy: "vendor" }),
})

export default Vendor
