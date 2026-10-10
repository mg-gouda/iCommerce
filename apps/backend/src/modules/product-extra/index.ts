import { Module } from "@medusajs/framework/utils"
import ProductExtraModuleService from "./service"

export const PRODUCT_EXTRA_MODULE = "product_extra"

export default Module(PRODUCT_EXTRA_MODULE, { service: ProductExtraModuleService })
