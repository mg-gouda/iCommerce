import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import VendorModule from "../modules/vendor"

// One vendor → many products; each product belongs to one vendor.
export default defineLink(VendorModule.linkable.vendor, {
  linkable: ProductModule.linkable.product,
  isList: true,
})
