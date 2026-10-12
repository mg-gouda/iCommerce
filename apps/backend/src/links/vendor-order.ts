import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import VendorModule from "../modules/vendor"

// One vendor → many vendor (child) orders. `status` lives on the link so vendors can filter by it:
// pending (to ship) → shipped → delivered, or canceled.
export default defineLink(
  VendorModule.linkable.vendor,
  { linkable: OrderModule.linkable.order, isList: true },
  { database: { extraColumns: { status: { type: "text", defaultValue: "'pending'" } } } },
)
