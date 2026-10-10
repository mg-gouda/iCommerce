import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import ProductExtraModule from "../modules/product-extra"

export default defineLink(ProductModule.linkable.product, {
  linkable: ProductExtraModule.linkable.productExtra,
  deleteCascade: true,
})
